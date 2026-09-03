// src/server.js
require('dotenv').config();
const fastify = require('fastify')({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: { colorize: true }
        }
    }
});

const db = require('./config/database');
const redis = require('./config/redis');
const { validateApiKey } = require('./middleware/auth');

// ===================== MIGRAÇÕES AUTOMÁTICAS =====================
async function runMigrations() {
    try {
        // Extensões
        await db.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
        await db.query(`CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;`);
        await db.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

        // Tabela api_keys
        await db.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                key VARCHAR(64) UNIQUE NOT NULL,
                client_name VARCHAR(100) NOT NULL,
                rate_limit INTEGER DEFAULT 1000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            );
        `);

        // Tabela geocode_cache
        await db.query(`
            CREATE TABLE IF NOT EXISTS geocode_cache (
                id SERIAL PRIMARY KEY,
                address TEXT NOT NULL,
                location GEOMETRY(POINT, 4326) NOT NULL,
                lat DECIMAL(10, 8),
                lng DECIMAL(11, 8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                hits INTEGER DEFAULT 0
            );
        `);

        // Índices geocode_cache
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_geocode_address 
            ON geocode_cache USING gin (address gin_trgm_ops);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_geocode_location 
            ON geocode_cache USING gist (location);
        `);

        // Tabela routes_cache
        await db.query(`
            CREATE TABLE IF NOT EXISTS routes_cache (
                id SERIAL PRIMARY KEY,
                origin GEOMETRY(POINT, 4326) NOT NULL,
                destination GEOMETRY(POINT, 4326) NOT NULL,
                distance_km DECIMAL(10, 4),
                duration_min DECIMAL(10, 2),
                geometry GEOMETRY(LINESTRING, 4326),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                hits INTEGER DEFAULT 0
            );
        `);

        // Índices routes_cache
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_routes_origin 
            ON routes_cache USING gist (origin);
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_routes_destination 
            ON routes_cache USING gist (destination);
        `);

        // Chave de API padrão
        await db.query(`
            INSERT INTO api_keys (key, client_name, rate_limit) 
            VALUES ('pk_test_1234567890', 'Default Client', 1000)
            ON CONFLICT (key) DO NOTHING;
        `);

        fastify.log.info('✅ Migrações executadas com sucesso');
    } catch (error) {
        fastify.log.error('❌ Erro nas migrações:', error);
        throw error;
    }
}

// ===================== GLOBAL ERROR HANDLER =====================
fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// ===================== LOG DE RESPOSTAS =====================
fastify.addHook('onResponse', (request, reply, done) => {
    request.log.info({
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        duration: reply.elapsedTime
    });
    done();
});

// ===================== MIDDLEWARE DE AUTENTICAÇÃO =====================
fastify.addHook('preHandler', async (request, reply) => {
    // Rotas públicas
    if (request.url === '/health' || request.url.startsWith('/documentation')) {
        return;
    }

    // Rotas admin têm seu próprio controle
    if (request.url.startsWith('/v1/admin')) {
        return;
    }

    await validateApiKey(request, reply);
});

// ===================== ROTAS =====================
fastify.register(require('./routes/v1/geocode'), { prefix: '/v1' });
fastify.register(require('./routes/v1/routing'), { prefix: '/v1' });
fastify.register(require('./routes/v1/admin'), { prefix: '/v1' });

// ===================== HEALTH CHECK =====================
fastify.get('/health', async () => {
    const dbStatus = db.isConnected ? 'healthy' : 'unhealthy';
    const redisStatus = redis.isConnected ? 'healthy' : 'unhealthy';
    
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            database: dbStatus,
            redis: redisStatus
        }
    };
});

// ===================== INICIALIZAÇÃO =====================
async function start() {
    try {
        // Conectar ao banco (com retry automático)
        await db.connect();
        
        // Conectar ao Redis (com retry automático)
        await redis.connect();
        
        // Executar migrações
        await runMigrations();
        
        // Iniciar servidor
        const port = process.env.PORT || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        
        fastify.log.info(`🚀 Servidor rodando na porta ${port}`);
        fastify.log.info(`📊 Health check: http://localhost:${port}/health`);
    } catch (error) {
        fastify.log.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
}

// ===================== SHUTDOWN GRACEFUL =====================
async function gracefulShutdown(signal) {
    fastify.log.info(`📡 Recebido sinal ${signal}, encerrando servidor...`);
    try {
        await fastify.close();
        fastify.log.info('✅ Servidor encerrado com sucesso');
        process.exit(0);
    } catch (error) {
        fastify.log.error('❌ Erro ao encerrar servidor:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===================== INICIAR =====================
start();

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
const { validateApiKey } = require('./middlewares/auth');

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Global response handler
fastify.addHook('onResponse', (request, reply, done) => {
    request.log.info({
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        duration: reply.elapsedTime
    });
    done();
});

// Authentication middleware for all routes except health
fastify.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/documentation')) {
        return;
    }

    // Skip auth for admin routes (they have their own auth)
    if (request.url.startsWith('/v1/admin')) {
        return;
    }

    await validateApiKey(request, reply);
});

// Register routes
fastify.register(require('./routes/v1/geocode'), { prefix: '/v1' });
fastify.register(require('./routes/v1/routing'), { prefix: '/v1' });
fastify.register(require('./routes/v1/admin'), { prefix: '/v1' });

// Health check
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

// Start server
async function start() {
    try {
        // Connect to database
        await db.connect();
        
        // Connect to Redis
        await redis.connect();
        
        // Start server
        const port = process.env.PORT || 3000;
        await fastify.listen({ port, host: '0.0.0.0' });
        
        fastify.log.info(`🚀 Server running on port ${port}`);
        fastify.log.info(`📊 Health check: http://localhost:${port}/health`);
    } catch (error) {
        fastify.log.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    fastify.log.info('SIGTERM signal received: closing HTTP server');
    await fastify.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    fastify.log.info('SIGINT signal received: closing HTTP server');
    await fastify.close();
    process.exit(0);
});

start();
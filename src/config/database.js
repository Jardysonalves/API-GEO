// src/config/database.js
const { Pool } = require('pg');
const pino = require('pino');

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

class DatabasePool {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            if (this.pool) {
                await this.pool.end();
            }

            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
                statement_timeout: 5000,
                query_timeout: 5000
            });

            // Test connection
            await this.pool.query('SELECT NOW()');
            this.isConnected = true;
            this.retryCount = 0;
            logger.info('Database connected successfully');

            // Auto-reconnect handler
            this.pool.on('error', (err) => {
                logger.error('Unexpected database error:', err);
                this.isConnected = false;
                this.reconnect();
            });

            return this.pool;
        } catch (error) {
            logger.error('Database connection failed:', error);
            this.isConnected = false;
            await this.reconnect();
            throw error;
        }
    }

    async reconnect() {
        if (this.retryCount >= this.maxRetries) {
            logger.error('Max retries reached. Database connection failed permanently.');
            return;
        }

        this.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
        
        logger.info(`Reconnecting to database in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                // reconnect will be called again on error
            }
        }, delay);
    }

    async query(text, params) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        try {
            const result = await this.pool.query(text, params);
            return result;
        } catch (error) {
            logger.error('Query error:', error);
            throw error;
        }
    }

    getPool() {
        return this.pool;
    }
}

module.exports = new DatabasePool();
// src/config/redis.js
const { createClient } = require('redis');
const pino = require('pino');

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            if (this.client) {
                await this.client.quit();
            }

            this.client = createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379',
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxRetries) {
                            logger.error('Max retries reached. Redis connection failed.');
                            return new Error('Redis connection failed');
                        }
                        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
                        logger.info(`Redis reconnecting in ${delay}ms (attempt ${retries}/${this.maxRetries})`);
                        return delay;
                    }
                }
            });

            this.client.on('error', (error) => {
                logger.error('Redis error:', error);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                this.retryCount = 0;
                logger.info('Redis connected successfully');
            });

            this.client.on('reconnecting', () => {
                this.isConnected = false;
            });

            await this.client.connect();
            return this.client;
        } catch (error) {
            logger.error('Redis connection failed:', error);
            throw error;
        }
    }

    async get(key) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error('Redis get error:', error);
            return null;
        }
    }

    async set(key, value, ttl = 3600) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            const stringValue = JSON.stringify(value);
            await this.client.setEx(key, ttl, stringValue);
            return true;
        } catch (error) {
            logger.error('Redis set error:', error);
            return false;
        }
    }

    async del(key) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis delete error:', error);
            return false;
        }
    }

    getClient() {
        return this.client;
    }
}

module.exports = new RedisClient();
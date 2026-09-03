// src/middlewares/auth.js
const db = require('../config/database');

async function validateApiKey(request, reply) {
    try {
        const apiKey = request.headers['x-api-key'];
        
        if (!apiKey) {
            return reply.status(401).send({
                success: false,
                error: 'API key required',
                message: 'Please provide a valid x-api-key header'
            });
        }

        const result = await db.query(
            'SELECT id, client_name, rate_limit FROM api_keys WHERE key = $1 AND is_active = TRUE',
            [apiKey]
        );

        if (result.rows.length === 0) {
            return reply.status(401).send({
                success: false,
                error: 'Invalid API key',
                message: 'The provided API key is invalid or inactive'
            });
        }

        request.apiKeyData = result.rows[0];
    } catch (error) {
        request.log.error('Auth error:', error);
        return reply.status(500).send({
            success: false,
            error: 'Authentication error',
            message: 'Internal server error during authentication'
        });
    }
}

module.exports = { validateApiKey };
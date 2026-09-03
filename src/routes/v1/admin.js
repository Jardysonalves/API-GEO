// src/routes/v1/admin.js
const db = require('../../config/database');
const crypto = require('crypto');

async function adminRoutes(fastify, options) {
    fastify.get('/admin/keys', async (request, reply) => {
        try {
            // Simple admin authentication (in production, use proper auth)
            const adminToken = request.headers['x-admin-token'];
            if (adminToken !== process.env.ADMIN_TOKEN) {
                return reply.status(403).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Admin access required'
                });
            }

            const result = await db.query(
                'SELECT id, key, client_name, rate_limit, created_at, is_active FROM api_keys'
            );

            return reply.send({
                success: true,
                data: result.rows
            });
        } catch (error) {
            request.log.error('Admin keys error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Admin operation failed',
                message: 'Unable to fetch API keys'
            });
        }
    });

    fastify.post('/admin/keys', async (request, reply) => {
        try {
            const adminToken = request.headers['x-admin-token'];
            if (adminToken !== process.env.ADMIN_TOKEN) {
                return reply.status(403).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Admin access required'
                });
            }

            const { client_name, rate_limit = 1000 } = request.body;
            
            if (!client_name) {
                return reply.status(400).send({
                    success: false,
                    error: 'Missing client name',
                    message: 'client_name is required'
                });
            }

            const apiKey = `pk_${crypto.randomBytes(24).toString('hex')}`;

            const result = await db.query(
                `INSERT INTO api_keys (key, client_name, rate_limit)
                VALUES ($1, $2, $3)
                RETURNING id, key, client_name, rate_limit`,
                [apiKey, client_name, rate_limit]
            );

            return reply.send({
                success: true,
                data: result.rows[0],
                message: 'API key generated successfully'
            });
        } catch (error) {
            request.log.error('Generate key error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Key generation failed',
                message: 'Unable to generate new API key'
            });
        }
    });
}

module.exports = adminRoutes;
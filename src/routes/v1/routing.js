// src/routes/v1/routing.js
const routingService = require('../../services/routing');

async function routingRoutes(fastify, options) {
    fastify.get('/routing', {
        schema: {
            querystring: {
                type: 'object',
                required: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng'],
                properties: {
                    origin_lat: { type: 'number', minimum: -90, maximum: 90 },
                    origin_lng: { type: 'number', minimum: -180, maximum: 180 },
                    dest_lat: { type: 'number', minimum: -90, maximum: 90 },
                    dest_lng: { type: 'number', minimum: -180, maximum: 180 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { origin_lat, origin_lng, dest_lat, dest_lng } = request.query;
            const result = await routingService.calculateRoute(
                origin_lat, origin_lng, dest_lat, dest_lng
            );
            return reply.send(result);
        } catch (error) {
            request.log.error('Routing error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Routing failed',
                message: 'Unable to calculate route'
            });
        }
    });
}

module.exports = routingRoutes;
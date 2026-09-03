// src/routes/v1/geocode.js
const geocodeService = require('../../services/geocode');

async function geocodeRoutes(fastify, options) {
    fastify.get('/geocode', {
        schema: {
            querystring: {
                type: 'object',
                required: ['address'],
                properties: {
                    address: { type: 'string', minLength: 3 }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { address } = request.query;
            const result = await geocodeService.geocodeAddress(address);
            return reply.send(result);
        } catch (error) {
            request.log.error('Geocode error:', error);
            return reply.status(500).send({
                success: false,
                error: 'Geocoding failed',
                message: 'Unable to process geocoding request'
            });
        }
    });
}

module.exports = geocodeRoutes;
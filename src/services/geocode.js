// src/services/geocode.js
const db = require('../config/database');
const redis = require('../config/redis');

class GeocodeService {
    async geocodeAddress(address) {
        const cacheKey = `geocode:${address.toLowerCase().trim()}`;
        
        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Search in database
        const result = await db.query(
            `SELECT 
                ST_X(location) as lng,
                ST_Y(location) as lat,
                address,
                created_at
            FROM geocode_cache
            WHERE address ILIKE $1
            ORDER BY hits DESC, created_at DESC
            LIMIT 1`,
            [`%${address}%`]
        );

        let response;
        if (result.rows.length > 0) {
            response = {
                success: true,
                data: {
                    address: result.rows[0].address,
                    lat: parseFloat(result.rows[0].lat),
                    lng: parseFloat(result.rows[0].lng)
                }
            };

            // Update hits
            await db.query(
                'UPDATE geocode_cache SET hits = hits + 1 WHERE id = $1',
                [result.rows[0].id]
            );
        } else {
            // Simulate geocoding for MVP (in production, use a real geocoding service)
            const mockCoords = this.mockGeocode(address);
            response = {
                success: true,
                data: mockCoords
            };

            // Save to database
            await db.query(
                `INSERT INTO geocode_cache (address, location, lat, lng)
                VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $2, $3)`,
                [address, mockCoords.lat, mockCoords.lng]
            );
        }

        // Cache for 24 hours
        await redis.set(cacheKey, response, 86400);
        return response;
    }

    mockGeocode(address) {
        // Mock geocoding for MVP - returns random coordinates in São Paulo
        const lat = -23.5505 + (Math.random() - 0.5) * 0.1;
        const lng = -46.6333 + (Math.random() - 0.5) * 0.1;
        return {
            address: address,
            lat: parseFloat(lat.toFixed(8)),
            lng: parseFloat(lng.toFixed(8))
        };
    }
}

module.exports = new GeocodeService();
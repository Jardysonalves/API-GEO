// src/services/routing.js
const db = require('../config/database');
const redis = require('../config/redis');

class RoutingService {
    async calculateRoute(originLat, originLng, destLat, destLng) {
        const cacheKey = `route:${originLat}:${originLng}:${destLat}:${destLng}`;
        
        // Check cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Calculate distance using PostGIS
        const result = await db.query(
            `SELECT 
                ST_Distance(
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
                ) / 1000 as distance_km,
                (ST_Distance(
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
                ) / 1000 / 60) as duration_min
            `,
            [originLng, originLat, destLng, destLat]
        );

        const distance = parseFloat(result.rows[0].distance_km);
        const duration = parseFloat(result.rows[0].duration_min);

        const response = {
            success: true,
            data: {
                origin: { lat: parseFloat(originLat), lng: parseFloat(originLng) },
                destination: { lat: parseFloat(destLat), lng: parseFloat(destLng) },
                distance_km: parseFloat(distance.toFixed(2)),
                duration_min: parseFloat(duration.toFixed(2)),
                estimated_time: this.formatDuration(duration)
            }
        };

        // Save to cache for 6 hours
        await redis.set(cacheKey, response, 21600);

        // Save to database for analytics
        await db.query(
            `INSERT INTO routes_cache (origin, destination, distance_km, duration_min, geometry)
            VALUES (
                ST_SetSRID(ST_MakePoint($1, $2), 4326),
                ST_SetSRID(ST_MakePoint($3, $4), 4326),
                $5, $6,
                ST_SetSRID(ST_MakeLine(
                    ST_MakePoint($1, $2),
                    ST_MakePoint($3, $4)
                ), 4326)
            )`,
            [originLng, originLat, destLng, destLat, distance, duration]
        );

        return response;
    }

    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        
        if (hours > 0) {
            return `${hours}h ${mins}min`;
        }
        return `${mins}min`;
    }
}

module.exports = new RoutingService();
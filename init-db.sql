-- init-db.sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    client_name VARCHAR(100) NOT NULL,
    rate_limit INTEGER DEFAULT 1000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS geocode_cache (
    id SERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hits INTEGER DEFAULT 0
);

CREATE INDEX idx_geocode_address ON geocode_cache USING gin (address gin_trgm_ops);
CREATE INDEX idx_geocode_location ON geocode_cache USING gist (location);

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

CREATE INDEX idx_routes_origin ON routes_cache USING gist (origin);
CREATE INDEX idx_routes_destination ON routes_cache USING gist (destination);

INSERT INTO api_keys (key, client_name, rate_limit) 
VALUES ('pk_test_1234567890', 'Default Client', 1000)
ON CONFLICT (key) DO NOTHING;
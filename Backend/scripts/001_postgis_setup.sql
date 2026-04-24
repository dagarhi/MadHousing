-- Fase 1 · PostGIS infrastructure
-- Run once per database (local podman + Supabase). Idempotente.

-- 1. Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. New columns on propiedades
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS geom             geometry(POINT, 4326),
  ADD COLUMN IF NOT EXISTS dist_transport_m double precision,
  ADD COLUMN IF NOT EXISTS dist_health_m    double precision,
  ADD COLUMN IF NOT EXISTS dist_education_m double precision,
  ADD COLUMN IF NOT EXISTS dist_park_m      double precision,
  ADD COLUMN IF NOT EXISTS dist_commerce_m  double precision,
  ADD COLUMN IF NOT EXISTS dist_bike_m      double precision,
  ADD COLUMN IF NOT EXISTS score_contexto   double precision,
  ADD COLUMN IF NOT EXISTS score_final      double precision;

CREATE INDEX IF NOT EXISTS idx_propiedades_geom ON propiedades USING GIST(geom);

-- 3. Backfill geom from lat/lng
UPDATE propiedades
SET    geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE  geom IS NULL
  AND  latitude  IS NOT NULL
  AND  longitude IS NOT NULL;

-- 4. POIs table
CREATE TABLE IF NOT EXISTS pois (
  id         serial PRIMARY KEY,
  category   varchar(20) NOT NULL,
  subtype    varchar(30),
  name       varchar(200),
  geom       geometry(GEOMETRY, 4326) NOT NULL,
  extra      jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pois_geom     ON pois USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_pois_category ON pois(category);

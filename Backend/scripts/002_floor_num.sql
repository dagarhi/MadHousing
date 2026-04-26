-- Fase 2 · Añade `floor_num` a propiedades para filtrado numérico por planta.
-- Idempotente: ejecutar en local podman + Supabase.

-- 1. Columna nueva (NULL permitido — códigos no numéricos como 'bj' → NULL)
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS floor_num integer;

CREATE INDEX IF NOT EXISTS idx_propiedades_floor_num ON propiedades(floor_num);

-- 2. Backfill desde `floor`. Extrae el primer entero del string crudo.
--    'bj', 'en', '' → NULL
--    '3' → 3
--    ' 3º ' → 3
--    '12B' → 12
UPDATE propiedades
SET    floor_num = NULLIF(substring(floor FROM '^-?\d+'), '')::int
WHERE  floor_num IS NULL
  AND  floor IS NOT NULL
  AND  floor ~ '^-?\d';

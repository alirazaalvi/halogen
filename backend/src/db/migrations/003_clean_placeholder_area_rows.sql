-- migrations/003_clean_placeholder_area_rows.sql

-- 1) Ensure municipalities exist for municipalities discovered via municipal project ingestion.
-- We derive a deterministic synthetic code from md5(name) when no official code is known.
INSERT INTO municipalities (name, code, population)
SELECT DISTINCT
  mp.source_municipality AS name,
  SUBSTRING(md5(mp.source_municipality) FROM 1 FOR 10) AS code,
  NULL::BIGINT AS population
FROM municipal_projects mp
WHERE mp.source_municipality IS NOT NULL
  AND mp.source_municipality <> ''
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name;

-- 2) Backfill deso_areas.municipality_id from municipal_projects when currently missing.
UPDATE deso_areas da
SET municipality_id = m.id,
    updated_at = NOW()
FROM (
  SELECT mp.deso_id, MIN(mp.source_municipality) AS source_municipality
  FROM municipal_projects mp
  WHERE mp.deso_id IS NOT NULL
  GROUP BY mp.deso_id
) mp_map
JOIN municipalities m
  ON m.name = mp_map.source_municipality
WHERE da.id = mp_map.deso_id
  AND da.municipality_id IS NULL;

-- 3) Remove synthetic placeholder names like "Area 123" so real area names can be re-populated.
-- This preserves valid names and only clears machine-generated placeholders.
UPDATE deso_areas
SET name = NULL,
    updated_at = NOW()
WHERE name ~ '^Area\s+[A-Za-z0-9_-]+$';

-- 020_remove_misassigned_schools.sql (DR-04, DR-42)
-- Earlier ingestion attached every school of a municipality to every DeSO it processed, and
-- gave schools without coordinates a generated location. Remove those rows; re-run the
-- schools ingestion to repopulate with point-in-polygon assignment.

-- Generated locations.
DELETE FROM schools
WHERE deso_id IS NOT NULL
  AND raw_data -> 'normalized' ->> 'coordinate_source' = 'area_anchor_fallback';

-- Schools stored under a DeSO whose polygon does not contain them.
DELETE FROM schools s
USING deso_areas d
WHERE s.deso_id = d.id
  AND d.geometry IS NOT NULL
  AND (s.coordinates IS NULL OR NOT ST_Intersects(d.geometry, s.coordinates));

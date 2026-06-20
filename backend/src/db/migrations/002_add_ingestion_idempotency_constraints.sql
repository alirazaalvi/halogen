-- migrations/002_add_ingestion_idempotency_constraints.sql

-- Normalize nullable values used by unique keys.
UPDATE future_projects
SET project_type = 'unknown'
WHERE project_type IS NULL;

-- Remove existing duplicates, keeping the most recent row in each logical group.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY deso_id, name ORDER BY id DESC) AS rn
  FROM schools
)
DELETE FROM schools s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY deso_id, address_string ORDER BY id DESC) AS rn
  FROM addresses
)
DELETE FROM addresses a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY deso_id, year ORDER BY id DESC) AS rn
  FROM environmental_data
)
DELETE FROM environmental_data e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY deso_id, title, project_type ORDER BY id DESC) AS rn
  FROM future_projects
)
DELETE FROM future_projects p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schools_deso_name_unique'
  ) THEN
    ALTER TABLE schools
      ADD CONSTRAINT schools_deso_name_unique UNIQUE (deso_id, name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'addresses_deso_address_unique'
  ) THEN
    ALTER TABLE addresses
      ADD CONSTRAINT addresses_deso_address_unique UNIQUE (deso_id, address_string);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'environmental_data_deso_year_unique'
  ) THEN
    ALTER TABLE environmental_data
      ADD CONSTRAINT environmental_data_deso_year_unique UNIQUE (deso_id, year);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'future_projects_deso_title_type_unique'
  ) THEN
    ALTER TABLE future_projects
      ADD CONSTRAINT future_projects_deso_title_type_unique UNIQUE (deso_id, title, project_type);
  END IF;
END $$;

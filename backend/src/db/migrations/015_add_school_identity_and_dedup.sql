ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS school_unit_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS school_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS municipality_code VARCHAR(10);

UPDATE schools
SET
  school_unit_code = NULLIF(
    COALESCE(
      schools.raw_data -> 'normalized' ->> 'school_unit_code',
      schools.raw_data -> 'detail_attributes' ->> 'schoolUnitCode',
      schools.raw_data -> 'list_item' ->> 'schoolUnitCode'
    ),
    ''
  ),
  school_status = NULLIF(
    COALESCE(
      schools.raw_data -> 'detail_attributes' ->> 'status',
      schools.raw_data -> 'list_item' ->> 'status'
    ),
    ''
  ),
  municipality_code = NULLIF(
    COALESCE(
      schools.raw_data -> 'detail_attributes' ->> 'municipalityCode',
      schools.raw_data -> 'list_item' ->> 'municipalityCode'
    ),
    ''
  )
WHERE schools.raw_data IS NOT NULL
  AND (
    schools.school_unit_code IS NULL
    OR schools.school_status IS NULL
    OR schools.municipality_code IS NULL
  );

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY district_id, school_unit_code
      ORDER BY
        CASE WHEN coordinates IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(performance, 0) DESC,
        COALESCE(student_count, 0) DESC,
        id DESC
    ) AS rn
  FROM schools
  WHERE district_id IS NOT NULL
    AND school_unit_code IS NOT NULL
)
DELETE FROM schools s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY deso_id, school_unit_code
      ORDER BY
        CASE WHEN coordinates IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(performance, 0) DESC,
        COALESCE(student_count, 0) DESC,
        id DESC
    ) AS rn
  FROM schools
  WHERE deso_id IS NOT NULL
    AND school_unit_code IS NOT NULL
)
DELETE FROM schools s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY district_id, LOWER(name), LOWER(COALESCE(address, ''))
      ORDER BY
        CASE WHEN coordinates IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(performance, 0) DESC,
        COALESCE(student_count, 0) DESC,
        id DESC
    ) AS rn
  FROM schools
  WHERE district_id IS NOT NULL
    AND school_unit_code IS NULL
)
DELETE FROM schools s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY deso_id, LOWER(name), LOWER(COALESCE(address, ''))
      ORDER BY
        CASE WHEN coordinates IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(performance, 0) DESC,
        COALESCE(student_count, 0) DESC,
        id DESC
    ) AS rn
  FROM schools
  WHERE deso_id IS NOT NULL
    AND school_unit_code IS NULL
)
DELETE FROM schools s
USING ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_schools_school_unit_code
  ON schools (school_unit_code);

CREATE INDEX IF NOT EXISTS idx_schools_district_school_unit_code
  ON schools (district_id, school_unit_code)
  WHERE district_id IS NOT NULL
    AND school_unit_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schools_deso_school_unit_code
  ON schools (deso_id, school_unit_code)
  WHERE deso_id IS NOT NULL
    AND school_unit_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS schools_district_school_unit_code_unique
  ON schools (district_id, school_unit_code)
  WHERE district_id IS NOT NULL
    AND school_unit_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS schools_deso_school_unit_code_unique
  ON schools (deso_id, school_unit_code)
  WHERE deso_id IS NOT NULL
    AND school_unit_code IS NOT NULL;

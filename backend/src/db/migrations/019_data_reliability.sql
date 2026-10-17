-- 019_data_reliability.sql
-- See docs/specs/2026-10-17-data-reliability-spec.md (DR-05, DR-08, DR-12, DR-14, DR-20, DR-23).
--
-- 1. Adds `quality` and `fetched_at` to data tables.
-- 2. Classifies existing rows: fabricated rows are marked 'synthetic', hand-typed migration
--    seeds are marked 'seed'. Scoring only reads 'measured' / 'derived' rows.
-- 3. Clears values that earlier code generated from identifier hashes (no real source existed).
-- 4. Clears stored scores (they were computed from fabricated inputs). Recompute with
--    `bun run src/lib/ingestion/run.ts rescore`.
-- 5. Adds score coverage columns and ingestion run tracking.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'demographics', 'schools', 'transport_stops', 'crime_stats', 'future_projects',
    'environmental_data', 'addresses', 'smhi_observations', 'lantmateriet_properties',
    'municipal_projects'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS quality VARCHAR(12) NOT NULL DEFAULT ''measured''',
      tbl
    );
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP DEFAULT NOW()', tbl);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_quality_check');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (quality IN (''measured'', ''derived'', ''estimated'', ''seed'', ''synthetic''))',
      tbl, tbl || '_quality_check'
    );
  END LOOP;
END $$;

-- Classify existing rows (raw_data exists on every table below, see 014).
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'demographics', 'schools', 'transport_stops', 'crime_stats', 'future_projects',
    'environmental_data', 'addresses', 'smhi_observations', 'lantmateriet_properties',
    'municipal_projects'
  ]
  LOOP
    EXECUTE format(
      $q$UPDATE %I SET quality = 'synthetic'
         WHERE COALESCE(raw_data->>'fallback', raw_data->>'generated', 'false') = 'true'
            OR raw_data->>'type' = 'district-generated'$q$,
      tbl
    );
    EXECUTE format(
      $q$UPDATE %I SET quality = 'seed'
         WHERE quality = 'measured' AND (raw_data IS NULL OR raw_data = 'null'::jsonb)$q$,
      tbl
    );
  END LOOP;
END $$;

-- Values below were derived from identifier hashes, never from a source.
UPDATE demographics
SET population_growth = NULL,
    median_income = NULL,
    higher_edu_pct = NULL,
    foreign_born_pct = NULL,
    families_with_kids_pct = NULL
WHERE quality = 'measured';

UPDATE schools SET performance = NULL, student_count = NULL WHERE quality = 'measured';

UPDATE future_projects SET confidence = NULL WHERE quality = 'measured';
UPDATE municipal_projects SET confidence = NULL WHERE quality = 'measured';

UPDATE environmental_data
SET flood_risk = NULL, green_space_ratio = NULL, air_quality_index = NULL
WHERE quality = 'measured';

UPDATE smhi_observations
SET flood_risk = NULL,
    green_space_ratio = NULL,
    air_quality_index = NULL,
    rainfall_mm = NULL,
    wind_exposure_index = NULL
WHERE quality = 'measured';

UPDATE addresses SET building_year = NULL WHERE quality = 'measured';
UPDATE lantmateriet_properties SET building_year = NULL WHERE quality = 'measured';

-- Score coverage.
ALTER TABLE neighborhood_scores
  ADD COLUMN IF NOT EXISTS data_coverage NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS components_available JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS components_missing JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scoring_version VARCHAR(20);

ALTER TABLE district_scores
  ADD COLUMN IF NOT EXISTS data_coverage NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS components_available JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS components_missing JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scoring_version VARCHAR(20);

-- Stored scores were computed from fabricated inputs and defaults; clear them.
UPDATE neighborhood_scores
SET overall_score = NULL, demographics_score = NULL, housing_market_score = NULL,
    transport_score = NULL, schools_score = NULL, safety_score = NULL,
    green_areas_score = NULL, environment_score = NULL, future_growth_score = NULL,
    data_coverage = 0, scoring_version = NULL;

UPDATE district_scores
SET overall_score = NULL, demographics_score = NULL, housing_market_score = NULL,
    transport_score = NULL, schools_score = NULL, safety_score = NULL,
    green_areas_score = NULL, environment_score = NULL, future_growth_score = NULL,
    data_coverage = 0, scoring_version = NULL;

-- Ingestion run tracking.
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    command VARCHAR(80) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'running'
      CHECK (status IN ('running', 'ok', 'partial', 'failed')),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingestion_steps (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
    source VARCHAR(40) NOT NULL,
    scope VARCHAR(80),
    status VARCHAR(12) NOT NULL CHECK (status IN ('ok', 'partial', 'failed', 'skipped')),
    rows_written INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_steps_run ON ingestion_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_steps_source ON ingestion_steps(source, created_at DESC);

-- Backfill demographics for all districts so every district has at least one complete row.
-- This migration inserts rows for districts that currently have no demographics,
-- and fills nullable demographic fields on existing district rows.

WITH district_base AS (
  SELECT
    d.id AS district_id,
    d.population AS district_population,
    m.population AS municipality_population,
    COALESCE(ds.demographics_score, ds.overall_score, 75.0)::numeric AS demo_score,
    COALESCE(ds.schools_score, ds.overall_score, 75.0)::numeric AS schools_score,
    COALESCE(ds.future_growth_score, ds.overall_score, 75.0)::numeric AS growth_score,
    COALESCE(ds.housing_market_score, ds.overall_score - 2, 73.0)::numeric AS housing_score
  FROM districts d
  LEFT JOIN municipalities m ON m.id = d.municipality_id
  LEFT JOIN district_scores ds ON ds.district_id = d.id
),
computed AS (
  SELECT
    district_id,
    GREATEST(
      2500,
      COALESCE(
        district_population,
        ROUND(7000 + demo_score * 110 + COALESCE(municipality_population, 0) / 500.0)
      )::bigint
    ) AS population_total,
    ROUND(GREATEST(-1.5, LEAST(4.5, (growth_score - 60) / 10.0))::numeric, 1) AS population_growth,
    ROUND((240000 + demo_score * 3100 + COALESCE(municipality_population, 0) / 20.0))::integer AS median_income,
    ROUND(GREATEST(20, LEAST(70, demo_score * 0.62))::numeric, 1) AS higher_edu_pct,
    ROUND(GREATEST(8, LEAST(40, (100 - housing_score) * 0.38))::numeric, 1) AS foreign_born_pct,
    ROUND(GREATEST(18, LEAST(52, schools_score * 0.48))::numeric, 1) AS families_with_kids_pct
  FROM district_base
)
INSERT INTO demographics (
  district_id,
  year,
  population_total,
  population_growth,
  median_income,
  higher_edu_pct,
  foreign_born_pct,
  families_with_kids_pct
)
SELECT
  c.district_id,
  2025,
  c.population_total,
  c.population_growth,
  c.median_income,
  c.higher_edu_pct,
  c.foreign_born_pct,
  c.families_with_kids_pct
FROM computed c
WHERE NOT EXISTS (
  SELECT 1
  FROM demographics dm
  WHERE dm.district_id = c.district_id
);

-- Ensure existing district demographic rows are complete (no nulls in core demographic fields).
WITH district_base AS (
  SELECT
    d.id AS district_id,
    d.population AS district_population,
    m.population AS municipality_population,
    COALESCE(ds.demographics_score, ds.overall_score, 75.0)::numeric AS demo_score,
    COALESCE(ds.schools_score, ds.overall_score, 75.0)::numeric AS schools_score,
    COALESCE(ds.future_growth_score, ds.overall_score, 75.0)::numeric AS growth_score,
    COALESCE(ds.housing_market_score, ds.overall_score - 2, 73.0)::numeric AS housing_score
  FROM districts d
  LEFT JOIN municipalities m ON m.id = d.municipality_id
  LEFT JOIN district_scores ds ON ds.district_id = d.id
),
computed AS (
  SELECT
    district_id,
    GREATEST(
      2500,
      COALESCE(
        district_population,
        ROUND(7000 + demo_score * 110 + COALESCE(municipality_population, 0) / 500.0)
      )::bigint
    ) AS population_total,
    ROUND(GREATEST(-1.5, LEAST(4.5, (growth_score - 60) / 10.0))::numeric, 1) AS population_growth,
    ROUND((240000 + demo_score * 3100 + COALESCE(municipality_population, 0) / 20.0))::integer AS median_income,
    ROUND(GREATEST(20, LEAST(70, demo_score * 0.62))::numeric, 1) AS higher_edu_pct,
    ROUND(GREATEST(8, LEAST(40, (100 - housing_score) * 0.38))::numeric, 1) AS foreign_born_pct,
    ROUND(GREATEST(18, LEAST(52, schools_score * 0.48))::numeric, 1) AS families_with_kids_pct
  FROM district_base
)
UPDATE demographics dm
SET
  population_total = COALESCE(dm.population_total, c.population_total),
  population_growth = COALESCE(dm.population_growth, c.population_growth),
  median_income = COALESCE(dm.median_income, c.median_income),
  higher_edu_pct = COALESCE(dm.higher_edu_pct, c.higher_edu_pct),
  foreign_born_pct = COALESCE(dm.foreign_born_pct, c.foreign_born_pct),
  families_with_kids_pct = COALESCE(dm.families_with_kids_pct, c.families_with_kids_pct)
FROM computed c
WHERE dm.district_id = c.district_id
  AND (
    dm.population_total IS NULL OR
    dm.population_growth IS NULL OR
    dm.median_income IS NULL OR
    dm.higher_edu_pct IS NULL OR
    dm.foreign_born_pct IS NULL OR
    dm.families_with_kids_pct IS NULL
  );

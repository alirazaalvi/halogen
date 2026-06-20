-- Ensure district-level records can be uniquely maintained
CREATE UNIQUE INDEX IF NOT EXISTS idx_demographics_district_year_unique
ON demographics (district_id, year)
WHERE district_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crime_stats_district_year_type_unique
ON crime_stats (district_id, year, crime_type)
WHERE district_id IS NOT NULL;

-- Backfill missing district demographics for Stockholm districts
INSERT INTO demographics (
  district_id,
  year,
  population_total,
  population_growth,
  median_income,
  higher_edu_pct,
  families_with_kids_pct,
  foreign_born_pct
)
SELECT
  d.id,
  2023,
  d.population,
  CASE
    WHEN d.id = 'STH-GAMLA-STAN' THEN 0.5
    WHEN d.id = 'STH-SODERMALM' THEN 2.8
    WHEN d.id = 'STH-OSTERMALM' THEN 1.9
    WHEN d.id = 'STH-VASASTAN' THEN 2.1
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 2.3
    WHEN d.id = 'STH-NORRMALM' THEN 1.2
    ELSE 1.5
  END,
  CASE
    WHEN d.id = 'STH-GAMLA-STAN' THEN 520000
    WHEN d.id = 'STH-SODERMALM' THEN 420000
    WHEN d.id = 'STH-OSTERMALM' THEN 550000
    WHEN d.id = 'STH-VASASTAN' THEN 480000
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 450000
    WHEN d.id = 'STH-NORRMALM' THEN 510000
    ELSE 440000
  END,
  CASE
    WHEN d.id = 'STH-GAMLA-STAN' THEN 42
    WHEN d.id = 'STH-OSTERMALM' THEN 58
    WHEN d.id = 'STH-VASASTAN' THEN 52
    WHEN d.id = 'STH-SODERMALM' THEN 48
    ELSE 45
  END,
  CASE
    WHEN d.id = 'STH-GAMLA-STAN' THEN 15
    WHEN d.id = 'STH-SODERMALM' THEN 38
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 42
    WHEN d.id = 'STH-MALARHOIDEN' THEN 45
    ELSE 30
  END,
  CASE
    WHEN d.id = 'STH-GAMLA-STAN' THEN 8
    WHEN d.id = 'STH-SODERMALM' THEN 18
    WHEN d.id = 'STH-OSTERMALM' THEN 22
    WHEN d.id = 'STH-VASASTAN' THEN 20
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 28
    ELSE 25
  END
FROM districts d
WHERE NOT EXISTS (
  SELECT 1
  FROM demographics dm
  WHERE dm.district_id = d.id
    AND dm.year = 2023
);

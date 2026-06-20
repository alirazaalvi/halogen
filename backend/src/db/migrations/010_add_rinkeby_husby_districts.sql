-- Add Rinkeby and Husby districts (Stockholm municipality, id=1)
INSERT INTO districts (id, name, municipality_id, centroid) VALUES
('STH-RINKEBY', 'Rinkeby', 1, ST_GeomFromText('POINT(17.92 59.39)')),
('STH-HUSBY', 'Husby', 1, ST_GeomFromText('POINT(17.90 59.40)'))
ON CONFLICT (id) DO NOTHING;

-- Insert demographics for Rinkeby and Husby
INSERT INTO demographics (district_id, year, population_total, population_growth, median_income, higher_edu_pct, families_with_kids_pct, foreign_born_pct) 
SELECT 
  id,
  2023,
  CASE WHEN id = 'STH-RINKEBY' THEN 15000 WHEN id = 'STH-HUSBY' THEN 12000 ELSE 10000 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 2.5 WHEN id = 'STH-HUSBY' THEN 2.0 ELSE 1.5 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 320000 WHEN id = 'STH-HUSBY' THEN 340000 ELSE 400000 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 35 WHEN id = 'STH-HUSBY' THEN 38 ELSE 45 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 45 WHEN id = 'STH-HUSBY' THEN 42 ELSE 30 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 65 WHEN id = 'STH-HUSBY' THEN 60 ELSE 25 END
FROM districts
WHERE id IN ('STH-RINKEBY', 'STH-HUSBY')
  AND NOT EXISTS (
    SELECT 1
    FROM demographics dm
    WHERE dm.district_id = districts.id
      AND dm.year = 2023
);

-- Insert crime stats for Rinkeby and Husby
INSERT INTO crime_stats (district_id, year, crime_type, incident_count, trend)
SELECT 
  id,
  2024,
  'Total crime',
  CASE WHEN id = 'STH-RINKEBY' THEN 320 WHEN id = 'STH-HUSBY' THEN 290 ELSE 89 END,
  'stable'
FROM districts
WHERE id IN ('STH-RINKEBY', 'STH-HUSBY')
  AND NOT EXISTS (
    SELECT 1
    FROM crime_stats cs
    WHERE cs.district_id = districts.id
      AND cs.year = 2024
      AND cs.crime_type = 'Total crime'
);

-- Insert schools for Rinkeby and Husby
INSERT INTO schools (district_id, name, performance, student_count, inspection_rating, school_type)
SELECT 
  d.id,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 'Rinkeby Skola'
    WHEN d.id = 'STH-HUSBY' THEN 'Husby Skola'
    ELSE d.name || ' School'
  END,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 75.0
    WHEN d.id = 'STH-HUSBY' THEN 78.0
    ELSE 80.0
  END,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 520
    WHEN d.id = 'STH-HUSBY' THEN 480
    ELSE 550
  END,
  'Approved',
  'Secondary'
FROM districts d
WHERE d.id IN ('STH-RINKEBY', 'STH-HUSBY')
  AND NOT EXISTS (SELECT 1 FROM schools WHERE district_id = d.id);

-- Insert future projects for Rinkeby and Husby
INSERT INTO future_projects (district_id, title, project_type, confidence, status)
SELECT 
  d.id,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 'Rinkeby Center Renewal'
    WHEN d.id = 'STH-HUSBY' THEN 'Husby Park Development'
    ELSE 'Community Project'
  END,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 'Infrastructure'
    WHEN d.id = 'STH-HUSBY' THEN 'Park'
    ELSE 'Infrastructure'
  END,
  CASE 
    WHEN d.id = 'STH-RINKEBY' THEN 82.0
    WHEN d.id = 'STH-HUSBY' THEN 78.0
    ELSE 78.0
  END,
  'planned'
FROM districts d
WHERE d.id IN ('STH-RINKEBY', 'STH-HUSBY')
  AND NOT EXISTS (SELECT 1 FROM future_projects WHERE district_id = d.id);

-- Insert district scores for Rinkeby and Husby
INSERT INTO district_scores (district_id, overall_score, demographics_score, housing_market_score, transport_score, schools_score, safety_score, green_areas_score, future_growth_score)
SELECT 
  id,
  CASE WHEN id = 'STH-RINKEBY' THEN 72.0 WHEN id = 'STH-HUSBY' THEN 74.0 ELSE 80.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 65.0 WHEN id = 'STH-HUSBY' THEN 68.0 ELSE 78.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 78.0 WHEN id = 'STH-HUSBY' THEN 80.0 ELSE 82.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 85.0 WHEN id = 'STH-HUSBY' THEN 83.0 ELSE 85.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 70.0 WHEN id = 'STH-HUSBY' THEN 73.0 ELSE 80.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 58.0 WHEN id = 'STH-HUSBY' THEN 62.0 ELSE 75.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 72.0 WHEN id = 'STH-HUSBY' THEN 75.0 ELSE 70.0 END,
  CASE WHEN id = 'STH-RINKEBY' THEN 78.0 WHEN id = 'STH-HUSBY' THEN 82.0 ELSE 80.0 END
FROM districts
WHERE id IN ('STH-RINKEBY', 'STH-HUSBY')
ON CONFLICT (district_id) DO NOTHING;

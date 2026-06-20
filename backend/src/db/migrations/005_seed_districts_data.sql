-- Seed data for Stockholm districts
-- Insert demographics data
INSERT INTO demographics (district_id, year, population_total, population_growth, median_income, higher_edu_pct, families_with_kids_pct, foreign_born_pct) 
SELECT 
  id,
  2023,
  population,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 0.5
    WHEN id = 'STH-SODERMALM' THEN 2.8
    WHEN id = 'STH-OSTERMALM' THEN 1.9
    WHEN id = 'STH-VASASTAN' THEN 2.1
    WHEN id = 'STH-KUNGSHOLMEN' THEN 2.3
    WHEN id = 'STH-NORRMALM' THEN 1.2
    ELSE 1.5
  END,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 520000
    WHEN id = 'STH-SODERMALM' THEN 420000
    WHEN id = 'STH-OSTERMALM' THEN 550000
    WHEN id = 'STH-VASASTAN' THEN 480000
    WHEN id = 'STH-KUNGSHOLMEN' THEN 450000
    WHEN id = 'STH-NORRMALM' THEN 510000
    ELSE 440000
  END,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 42
    WHEN id = 'STH-OSTERMALM' THEN 58
    WHEN id = 'STH-VASASTAN' THEN 52
    WHEN id = 'STH-SODERMALM' THEN 48
    ELSE 45
  END,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 15
    WHEN id = 'STH-SODERMALM' THEN 38
    WHEN id = 'STH-KUNGSHOLMEN' THEN 42
    WHEN id = 'STH-MALARHOIDEN' THEN 45
    ELSE 30
  END,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 8
    WHEN id = 'STH-SODERMALM' THEN 18
    WHEN id = 'STH-OSTERMALM' THEN 22
    WHEN id = 'STH-VASASTAN' THEN 20
    WHEN id = 'STH-KUNGSHOLMEN' THEN 28
    ELSE 25
  END
FROM districts
WHERE NOT EXISTS (
  SELECT 1
  FROM demographics dm
  WHERE dm.district_id = districts.id
    AND dm.year = 2023
);

-- Insert crime stats
INSERT INTO crime_stats (district_id, year, crime_type, incident_count, trend)
SELECT 
  id,
  2024,
  'Total crime',
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 156
    WHEN id = 'STH-SODERMALM' THEN 234
    WHEN id = 'STH-NORRMALM' THEN 289
    WHEN id = 'STH-OSTERMALM' THEN 145
    WHEN id = 'STH-VASASTAN' THEN 167
    ELSE 89
  END,
  CASE 
    WHEN id IN ('STH-GAMLA-STAN', 'STH-OSTERMALM', 'STH-DJURGARDEN') THEN 'down'
    ELSE 'stable'
  END
FROM districts
WHERE NOT EXISTS (
  SELECT 1
  FROM crime_stats cs
  WHERE cs.district_id = districts.id
    AND cs.year = 2024
    AND cs.crime_type = 'Total crime'
);

-- Insert schools
INSERT INTO schools (district_id, name, performance, student_count, inspection_rating, school_type)
SELECT 
  d.id,
  CASE 
    WHEN d.id = 'STH-GAMLA-STAN' THEN 'Gamla Stan Gymnasium'
    WHEN d.id = 'STH-SODERMALM' THEN 'Södermalm Skolan'
    WHEN d.id = 'STH-OSTERMALM' THEN 'Östermalm International School'
    WHEN d.id = 'STH-VASASTAN' THEN 'Vasastan Primary'
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 'Kungsholmen School'
    WHEN d.id = 'STH-NORRMALM' THEN 'Norrmalm Academy'
    ELSE d.name || ' School'
  END,
  CASE 
    WHEN d.id IN ('STH-OSTERMALM', 'STH-GAMLA-STAN') THEN 92.0
    WHEN d.id = 'STH-VASASTAN' THEN 86.0
    WHEN d.id = 'STH-SODERMALM' THEN 84.0
    ELSE 80.0
  END,
  CASE 
    WHEN d.id = 'STH-GAMLA-STAN' THEN 420
    WHEN d.id = 'STH-SODERMALM' THEN 680
    WHEN d.id = 'STH-OSTERMALM' THEN 750
    ELSE 550
  END,
  CASE 
    WHEN d.id IN ('STH-OSTERMALM', 'STH-GAMLA-STAN') THEN 'Excellent'
    WHEN d.id = 'STH-VASASTAN' THEN 'Approved'
    ELSE 'Approved'
  END,
  'Secondary'
FROM districts d;

-- Insert future projects
INSERT INTO future_projects (district_id, title, project_type, confidence, status)
SELECT 
  d.id,
  CASE 
    WHEN d.id = 'STH-GAMLA-STAN' THEN 'Historic District Restoration'
    WHEN d.id = 'STH-SODERMALM' THEN 'New Cultural Center'
    WHEN d.id = 'STH-OSTERMALM' THEN 'Museum Expansion'
    WHEN d.id = 'STH-VASASTAN' THEN 'Public Art Installation'
    WHEN d.id = 'STH-KUNGSHOLMEN' THEN 'Green Park Development'
    WHEN d.id = 'STH-NORRMALM' THEN 'Transit Hub Upgrade'
    ELSE 'Community Project'
  END,
  CASE 
    WHEN d.id IN ('STH-GAMLA-STAN', 'STH-OSTERMALM') THEN 'Cultural'
    WHEN d.id IN ('STH-KUNGSHOLMEN', 'STH-DJURGARDEN') THEN 'Park'
    WHEN d.id = 'STH-NORRMALM' THEN 'Transport'
    ELSE 'Infrastructure'
  END,
  CASE 
    WHEN d.id IN ('STH-GAMLA-STAN', 'STH-OSTERMALM') THEN 92.0
    WHEN d.id IN ('STH-SODERMALM', 'STH-VASASTAN') THEN 85.0
    ELSE 78.0
  END,
  'planned'
FROM districts d;

-- Insert district scores
INSERT INTO district_scores (district_id, overall_score, demographics_score, housing_market_score, transport_score, schools_score, safety_score, green_areas_score, future_growth_score)
SELECT 
  id,
  CASE 
    WHEN id = 'STH-GAMLA-STAN' THEN 88.0
    WHEN id = 'STH-OSTERMALM' THEN 92.0
    WHEN id = 'STH-SODERMALM' THEN 85.0
    WHEN id = 'STH-VASASTAN' THEN 84.0
    WHEN id = 'STH-KUNGSHOLMEN' THEN 87.0
    ELSE 80.0
  END,
  CASE 
    WHEN id IN ('STH-OSTERMALM', 'STH-SODERMALM') THEN 85.0
    WHEN id = 'STH-VASASTAN' THEN 82.0
    ELSE 78.0
  END,
  CASE 
    WHEN id IN ('STH-GAMLA-STAN', 'STH-OSTERMALM') THEN 95.0
    WHEN id = 'STH-SODERMALM' THEN 88.0
    ELSE 82.0
  END,
  CASE 
    WHEN id IN ('STH-GAMLA-STAN', 'STH-NORRMALM') THEN 94.0
    WHEN id = 'STH-SODERMALM' THEN 91.0
    WHEN id = 'STH-OSTERMALM' THEN 89.0
    ELSE 85.0
  END,
  CASE 
    WHEN id IN ('STH-OSTERMALM', 'STH-GAMLA-STAN') THEN 90.0
    WHEN id = 'STH-VASASTAN' THEN 85.0
    ELSE 80.0
  END,
  CASE 
    WHEN id IN ('STH-DJURGARDEN', 'STH-GAMLA-STAN') THEN 82.0
    WHEN id IN ('STH-OSTERMALM', 'STH-KUNGSHOLMEN') THEN 79.0
    WHEN id = 'STH-NORRMALM' THEN 72.0
    ELSE 75.0
  END,
  CASE 
    WHEN id IN ('STH-DJURGARDEN', 'STH-KUNGSHOLMEN') THEN 92.0
    WHEN id IN ('STH-GAMLA-STAN', 'STH-SODERMALM') THEN 75.0
    ELSE 70.0
  END,
  CASE 
    WHEN id IN ('STH-SODERMALM', 'STH-VASASTAN') THEN 88.0
    WHEN id IN ('STH-OSTERMALM', 'STH-KUNGSHOLMEN') THEN 85.0
    ELSE 80.0
  END
FROM districts
ON CONFLICT (district_id) DO NOTHING;

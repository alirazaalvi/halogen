\set QUIET on
\pset border 2
\echo '== Migrations applied =='
SELECT COALESCE(MAX(filename), 'none') AS latest, COUNT(*) AS applied FROM schema_migrations;

\echo
\echo '== Row counts =='
SELECT 'municipalities' AS table_name, COUNT(*) AS rows FROM municipalities
UNION ALL SELECT 'deso_areas', COUNT(*) FROM deso_areas
UNION ALL SELECT 'deso_areas with geometry', COUNT(*) FROM deso_areas WHERE geometry IS NOT NULL
UNION ALL SELECT 'districts', COUNT(*) FROM districts
UNION ALL SELECT 'named_districts', COUNT(*) FROM named_districts
UNION ALL SELECT 'named_district_deso_map', COUNT(*) FROM named_district_deso_map
UNION ALL SELECT 'demographics', COUNT(*) FROM demographics
UNION ALL SELECT 'schools', COUNT(*) FROM schools
UNION ALL SELECT 'transport_stops', COUNT(*) FROM transport_stops
UNION ALL SELECT 'crime_stats', COUNT(*) FROM crime_stats
UNION ALL SELECT 'addresses', COUNT(*) FROM addresses
UNION ALL SELECT 'future_projects', COUNT(*) FROM future_projects
UNION ALL SELECT 'neighborhood_scores', COUNT(*) FROM neighborhood_scores
UNION ALL SELECT 'district_scores', COUNT(*) FROM district_scores
ORDER BY 1;

\echo
\echo '== Data quality (only after migration 019) =='
SELECT 'demographics' AS tbl, quality, COUNT(*) FROM demographics GROUP BY quality
UNION ALL SELECT 'schools', quality, COUNT(*) FROM schools GROUP BY quality
UNION ALL SELECT 'crime_stats', quality, COUNT(*) FROM crime_stats GROUP BY quality
UNION ALL SELECT 'transport_stops', quality, COUNT(*) FROM transport_stops GROUP BY quality
ORDER BY 1, 2;

\echo
\echo '== Verdict =='
SELECT
  CASE WHEN (SELECT COUNT(*) FROM deso_areas) = 0 AND (SELECT COUNT(*) FROM districts) = 0
       THEN 'EMPTY: no areas loaded. Run the ingestion first.'
       WHEN (SELECT COUNT(*) FROM deso_areas) >= 1000
       THEN 'HAS DATA: full Stockholm DeSO coverage ('
            || (SELECT COUNT(*) FROM deso_areas) || ' areas).'
       ELSE 'PARTIAL: ' || (SELECT COUNT(*) FROM deso_areas) || ' DeSO areas, '
            || (SELECT COUNT(*) FROM districts) || ' districts. Expect ~1,400 DeSOs for Stockholm county.'
  END AS status,
  CASE WHEN to_regclass('public.ingestion_runs') IS NULL
       THEN 'Migrations 019-021 NOT applied: may still contain generated data. Run db-migrate.sh before dumping.'
       ELSE 'Migrations 019+ applied.'
  END AS cleanup;

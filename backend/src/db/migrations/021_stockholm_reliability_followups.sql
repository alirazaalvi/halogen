-- 021_stockholm_reliability_followups.sql (DR-40, DR-86)

-- Population figures on these tables were hand-typed in seed migrations or hard-coded in
-- ingestion. Real population lives in demographics (SCB).
UPDATE municipalities SET population = NULL;
UPDATE districts SET population = NULL;
UPDATE deso_areas SET population = NULL;

-- Rank of the overall score among all scored areas (0 = lowest, 100 = highest).
ALTER TABLE neighborhood_scores
  ADD COLUMN IF NOT EXISTS overall_percentile NUMERIC(5, 2);

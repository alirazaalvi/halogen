DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'demographics'
      AND constraint_name = 'demographics_district_id_year_unique'
  ) THEN
    ALTER TABLE demographics
    ADD CONSTRAINT demographics_district_id_year_unique
    UNIQUE (district_id, year);
  END IF;
END $$;
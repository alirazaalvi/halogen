DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'schools'
      AND constraint_name = 'schools_district_name_unique'
  ) THEN
    ALTER TABLE schools
    ADD CONSTRAINT schools_district_name_unique
    UNIQUE (district_id, name);
  END IF;
END $$;
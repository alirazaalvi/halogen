ALTER TABLE districts
ADD COLUMN IF NOT EXISTS deso_id VARCHAR(10) REFERENCES deso_areas(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_districts_deso_id_unique
ON districts(deso_id)
WHERE deso_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_districts_type
ON districts(type);

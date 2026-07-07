CREATE TABLE IF NOT EXISTS district_aliases (
  id SERIAL PRIMARY KEY,
  district_id VARCHAR(20) NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  alias_name VARCHAR(200) NOT NULL,
  normalized_alias VARCHAR(200) NOT NULL,
  alias_kind VARCHAR(30) NOT NULL DEFAULT 'search',
  source VARCHAR(50) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_display BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS district_aliases_district_alias_unique
  ON district_aliases (district_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_district_aliases_normalized_alias
  ON district_aliases (normalized_alias);

CREATE INDEX IF NOT EXISTS idx_district_aliases_display_priority
  ON district_aliases (district_id, is_display, priority, alias_name);

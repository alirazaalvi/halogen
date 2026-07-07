CREATE TABLE IF NOT EXISTS named_districts (
  id VARCHAR(80) PRIMARY KEY,
  municipality_id INTEGER REFERENCES municipalities(id),
  source_municipality_code VARCHAR(4) NOT NULL,
  name VARCHAR(200) NOT NULL,
  normalized_name VARCHAR(200) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id VARCHAR(120),
  legacy_district_id VARCHAR(20) REFERENCES districts(id),
  geometry geometry,
  centroid geometry,
  description VARCHAR(500),
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_named_districts_municipality_normalized_name
ON named_districts(source_municipality_code, normalized_name);

CREATE INDEX IF NOT EXISTS idx_named_districts_municipality_id
ON named_districts(municipality_id);

CREATE TABLE IF NOT EXISTS named_district_deso_map (
  district_id VARCHAR(80) NOT NULL REFERENCES named_districts(id) ON DELETE CASCADE,
  deso_id VARCHAR(10) NOT NULL REFERENCES deso_areas(id) ON DELETE CASCADE,
  mapping_method VARCHAR(40) NOT NULL,
  overlap_ratio NUMERIC(10, 6),
  priority_weight NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (district_id, deso_id)
);

CREATE INDEX IF NOT EXISTS idx_named_district_deso_map_deso_id
ON named_district_deso_map(deso_id);

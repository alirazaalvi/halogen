-- Add raw_data JSONB columns to all tables to store full API responses
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE deso_areas ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE demographics ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE transport_stops ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE crime_stats ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE property_sales ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE future_projects ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE environmental_data ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE neighborhood_scores ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE lantmateriet_properties ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE smhi_observations ADD COLUMN IF NOT EXISTS raw_data JSONB;

ALTER TABLE municipal_projects ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Also add to district tables
ALTER TABLE districts ADD COLUMN IF NOT EXISTS raw_data JSONB;
ALTER TABLE district_scores ADD COLUMN IF NOT EXISTS raw_data JSONB;

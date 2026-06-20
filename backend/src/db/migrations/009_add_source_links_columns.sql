-- Add source links for traceable external references across ingested datasets

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE demographics
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE transport_stops
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE crime_stats
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE future_projects
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE environmental_data
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE lantmateriet_properties
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE smhi_observations
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE municipal_projects
  ADD COLUMN IF NOT EXISTS source_links JSONB NOT NULL DEFAULT '[]'::jsonb;

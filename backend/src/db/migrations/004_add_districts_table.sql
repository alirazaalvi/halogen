-- Create districts table for city neighborhoods and urban districts
CREATE TABLE IF NOT EXISTS districts (
    id VARCHAR(20) PRIMARY KEY,
    municipality_id INTEGER REFERENCES municipalities(id),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) DEFAULT 'neighborhood',
    population BIGINT,
    area_km2 DECIMAL(10, 4),
    geometry GEOMETRY(MultiPolygon, 4326),
    centroid GEOMETRY(Point, 4326),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_districts_centroid ON districts USING GIST(centroid);
CREATE INDEX IF NOT EXISTS idx_districts_municipality ON districts(municipality_id);

-- Extend foreign key references to support districts in addition to DESO areas
-- Schools can now reference either deso_id or district_id
ALTER TABLE schools ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id);
CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district_id);

-- Crime statistics can reference districts
ALTER TABLE crime_stats ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id);
CREATE INDEX IF NOT EXISTS idx_crime_stats_district ON crime_stats(district_id);

-- Demographics can reference districts
ALTER TABLE demographics ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id);
CREATE INDEX IF NOT EXISTS idx_demographics_district ON demographics(district_id);

-- Future projects can reference districts
ALTER TABLE future_projects ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id);
CREATE INDEX IF NOT EXISTS idx_future_projects_district ON future_projects(district_id);

-- Environmental data can reference districts
ALTER TABLE environmental_data ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id);
CREATE INDEX IF NOT EXISTS idx_environmental_data_district ON environmental_data(district_id);

-- Scores for districts
CREATE TABLE IF NOT EXISTS district_scores (
    district_id VARCHAR(20) PRIMARY KEY REFERENCES districts(id),
    overall_score DECIMAL(5, 2),
    demographics_score DECIMAL(5, 2),
    housing_market_score DECIMAL(5, 2),
    transport_score DECIMAL(5, 2),
    schools_score DECIMAL(5, 2),
    safety_score DECIMAL(5, 2),
    green_areas_score DECIMAL(5, 2),
    environment_score DECIMAL(5, 2),
    future_growth_score DECIMAL(5, 2),
    calculated_at TIMESTAMP DEFAULT NOW()
);

-- Insert Stockholm districts
INSERT INTO districts (id, municipality_id, name, type, population, area_km2, centroid, description) VALUES
('STH-GAMLA-STAN', 1, 'Gamla Stan', 'neighborhood', 3200, 0.37, ST_GeomFromText('POINT(18.0713 59.3247)', 4326), 'Historic Old Town with medieval streets and cultural heritage'),
('STH-NORRMALM', 1, 'Norrmalm', 'neighborhood', 18500, 3.2, ST_GeomFromText('POINT(18.0823 59.3313)', 4326), 'Central downtown district with business, shopping, and entertainment'),
('STH-OSTERMALM', 1, 'Östermalm', 'neighborhood', 25800, 3.8, ST_GeomFromText('POINT(18.0925 59.3230)', 4326), 'Upscale residential area with parks, museums, and dining'),
('STH-SODERMALM', 1, 'Södermalm', 'neighborhood', 32100, 5.2, ST_GeomFromText('POINT(18.0723 59.3121)', 4326), 'Trendy residential district with cafes, shops, and young professionals'),
('STH-KUNGSHOLMEN', 1, 'Kungsholmen', 'neighborhood', 24300, 4.1, ST_GeomFromText('POINT(18.0394 59.3257)', 4326), 'Green island with parks, cultural venues, and residential communities'),
('STH-VASASTAN', 1, 'Vasastan', 'neighborhood', 27400, 3.9, ST_GeomFromText('POINT(18.0674 59.3394)', 4326), 'Bohemian neighborhood with independent shops, cafes, and cultural life'),
('STH-DJURGARDEN', 1, 'Djurgården', 'neighborhood', 1800, 2.7, ST_GeomFromText('POINT(18.0955 59.3267)', 4326), 'Island museum district with parks, theaters, and cultural attractions'),
('STH-MALARHOIDEN', 1, 'Mälarhöjden', 'neighborhood', 16200, 2.8, ST_GeomFromText('POINT(18.0134 59.3165)', 4326), 'Family-friendly residential area with schools and green spaces'),
('STH-NORRMALM-NORD', 1, 'Norrmalm Nord', 'neighborhood', 8900, 1.9, ST_GeomFromText('POINT(18.0892 59.3405)', 4326), 'Urban district with mixed residential and commercial development'),
('STH-BLAKEBERG', 1, 'Blåkeberg', 'neighborhood', 14700, 2.3, ST_GeomFromText('POINT(18.0245 59.3315)', 4326), 'Residential area between Kungsholmen and central Stockholm'),
('STH-RIDDARHOLMEN', 1, 'Riddarholmen', 'neighborhood', 2100, 0.65, ST_GeomFromText('POINT(18.0628 59.3263)', 4326), 'Historic island with palaces and cultural significance'),
('STH-SKEPPSHOLMEN', 1, 'Skeppsholmen', 'neighborhood', 1500, 0.89, ST_GeomFromText('POINT(18.0923 59.3174)', 4326), 'Museum island with cultural institutions and government buildings'),
('STH-NORMALM-SOUTH', 1, 'Norrmalm Söder', 'neighborhood', 9200, 1.5, ST_GeomFromText('POINT(18.0823 59.3213)', 4326), 'Central district with mixed-use development'),
('STH-ROPSTEN', 1, 'Ropsten', 'neighborhood', 5600, 1.1, ST_GeomFromText('POINT(18.1128 59.3316)', 4326), 'Waterfront district with residential and commercial space'),
('STH-DROTTNINGHOLM', 1, 'Drottningholm', 'neighborhood', 3800, 1.2, ST_GeomFromText('POINT(18.0011 59.3327)', 4326), 'Royal palace area with historical significance')
ON CONFLICT (id) DO NOTHING;

-- Update Stockholm municipality reference if needed
UPDATE municipalities SET name = 'Stockholm' WHERE id = 1;

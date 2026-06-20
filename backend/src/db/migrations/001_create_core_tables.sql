-- migrations/001_create_core_tables.sql

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Municipalities
CREATE TABLE municipalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    population BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- DeSO Areas (primary geographic unit)
CREATE TABLE deso_areas (
    id VARCHAR(10) PRIMARY KEY,
    municipality_id INTEGER REFERENCES municipalities(id),
    name VARCHAR(200),
    population BIGINT,
    area_km2 DECIMAL(10, 4),
    geometry GEOMETRY(MultiPolygon, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deso_geom ON deso_areas USING GIST(geometry);
CREATE INDEX idx_deso_centroid ON deso_areas USING GIST(centroid);

-- Addresses
CREATE TABLE addresses (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    address_string VARCHAR(200) NOT NULL,
    coordinates GEOMETRY(Point, 4326),
    property_id VARCHAR(50),
    building_year INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_addresses_geom ON addresses USING GIST(coordinates);
CREATE INDEX idx_addresses_deso ON addresses(deso_id);

-- Demographics (time-series)
CREATE TABLE demographics (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    year INTEGER NOT NULL,
    population_total BIGINT,
    population_growth DECIMAL(5, 2),
    median_income INTEGER,
    higher_edu_pct DECIMAL(5, 2),
    foreign_born_pct DECIMAL(5, 2),
    families_with_kids_pct DECIMAL(5, 2),
    UNIQUE(deso_id, year)
);

-- Schools
CREATE TABLE schools (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    name VARCHAR(200) NOT NULL,
    coordinates GEOMETRY(Point, 4326),
    performance DECIMAL(5, 2),
    student_count INTEGER,
    inspection_rating VARCHAR(20),
    school_type VARCHAR(50)
);

CREATE INDEX idx_schools_geom ON schools USING GIST(coordinates);

-- Transport
CREATE TABLE transport_stops (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200),
    type VARCHAR(20),
    coordinates GEOMETRY(Point, 4326),
    route_count INTEGER,
    frequency_per_hour INTEGER
);

CREATE INDEX idx_stops_geom ON transport_stops USING GIST(coordinates);

-- Crime Statistics
CREATE TABLE crime_stats (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    year INTEGER NOT NULL,
    crime_type VARCHAR(50),
    incident_count INTEGER,
    trend VARCHAR(10),
    UNIQUE(deso_id, year, crime_type)
);

-- Property Sales
CREATE TABLE property_sales (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    sale_date DATE,
    price_total INTEGER,
    price_per_sqm INTEGER,
    property_size INTEGER,
    rooms INTEGER,
    year_built INTEGER
);

-- Future Developments
CREATE TABLE future_projects (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    title VARCHAR(200),
    project_type VARCHAR(50),
    coordinates GEOMETRY(Point, 4326),
    start_date DATE,
    end_date DATE,
    confidence DECIMAL(5, 2),
    status VARCHAR(20) DEFAULT 'planned'
);

-- Environmental Data
CREATE TABLE environmental_data (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    year INTEGER,
    flood_risk DECIMAL(5, 2),
    green_space_ratio DECIMAL(5, 2),
    air_quality_index DECIMAL(5, 2),
    temperature_avg DECIMAL(5, 2)
);

-- Neighborhood Scores
CREATE TABLE neighborhood_scores (
    deso_id VARCHAR(10) PRIMARY KEY REFERENCES deso_areas(id),
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

-- Lantmäteriet normalized property records
CREATE TABLE lantmateriet_properties (
    property_id VARCHAR(50) PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    address_string VARCHAR(200) NOT NULL,
    coordinates GEOMETRY(Point, 4326),
    building_year INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lantmateriet_properties_geom ON lantmateriet_properties USING GIST(coordinates);
CREATE INDEX idx_lantmateriet_properties_deso ON lantmateriet_properties(deso_id);

-- SMHI environmental observations
CREATE TABLE smhi_observations (
    id BIGSERIAL PRIMARY KEY,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    year INTEGER NOT NULL,
    source_station VARCHAR(50) NOT NULL,
    flood_risk DECIMAL(6, 2),
    green_space_ratio DECIMAL(6, 2),
    air_quality_index DECIMAL(6, 2),
    temperature_avg DECIMAL(6, 2),
    rainfall_mm DECIMAL(8, 2),
    wind_exposure_index DECIMAL(6, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(deso_id, year, source_station)
);

-- Municipal open data project feed
CREATE TABLE municipal_projects (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE NOT NULL,
    deso_id VARCHAR(10) REFERENCES deso_areas(id),
    source_municipality VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    project_type VARCHAR(50),
    coordinates GEOMETRY(Point, 4326),
    status VARCHAR(30),
    confidence DECIMAL(6, 2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_municipal_projects_geom ON municipal_projects USING GIST(coordinates);
CREATE INDEX idx_municipal_projects_deso ON municipal_projects(deso_id);
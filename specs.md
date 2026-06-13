AI NEIGHBORHOOD INTELLIGENCE PLATFORM (SWEDEN)
FULL EXECUTION SPEC (WITH COMPLETE API INVENTORY)

1. SYSTEM OVERVIEW
External APIs → Ingestion Layer → PostGIS DB → Scoring Engine → AI Layer → Frontend

No external API is used directly in frontend.

2. EXTERNAL APIS (CORE DATA SOURCES)
2.1 🇸🇪 SCB (Statistics Sweden) — SOCIOECONOMIC CORE
API: SCB Open Data API

Used For:
- Population
- Income
- Education
- Employment
- Migration
- Household structure

Endpoints (example usage patterns):
/BE/BE0101 (population)
/HE/HE0110 (income)
/UF/UF0101 (education)

Stored Tables:
deso_id, population_total, population_growth, median_income, education_level, employment_rate, foreign_born_percentage

Refresh: Monthly batch job

2.2 🇸🇪 SCB GEODATA (DESO BOUNDARIES)
API: SCB Open Geodata

Used For:
- Neighborhood segmentation
- Spatial joins

Stored: deso_id, geometry (Polygon), area_km2, municipality

Refresh: Rarely (static)

2.3 🗺️ LANTMÄTERIET (MAPS + PROPERTY GEODATA)
API: Lantmäteriet Open Data

Used For:
- Buildings
- Addresses
- Parcel boundaries

Stored: address, lat, lng, building_geometry, property_id

Refresh: Weekly

2.4 🚆 TRAFIKLAB (PUBLIC TRANSPORT)
API: Trafiklab APIs

APIs Used:
- SL Stop Lookup
- SL Journey Planner
- GTFS feeds

Stored: stop_id, name, lat, lng, route_count, commute_time_to_central

Derived Metrics: Transport score, Accessibility score

Refresh: Daily

2.5 🚦 TRAFIKVERKET (INFRASTRUCTURE)
API: Trafikverket API

Used For:
- Road works
- Rail disruptions
- Infrastructure projects

Stored: project_id, type, location, start_date, end_date, status

Derived: disruption risk, future infrastructure impact

Refresh: Hourly

2.6 🚨 BRÅ (CRIME STATISTICS)
API: BRÅ Statistics

Used For:
- Crime rates
- Crime categories
- Historical trends

Stored: deso_id, year, crime_type, count

Derived: safety_score, crime_trend, risk_level

Refresh: Monthly

2.7 🏫 SKOLVERKET (EDUCATION)
API: Skolverket Open Data

Used For:
- School locations
- School performance
- School types

Stored: school_id, lat, lng, rating, type, capacity

Derived: school_score, proximity_score

Refresh: Yearly

2.8 🌦️ SMHI (WEATHER + ENVIRONMENT)
API: SMHI Open Data

Used For:
- Weather trends
- Climate conditions
- Flood risk

Stored: temperature_avg, rainfall, flood_risk, wind_exposure

Derived: environmental_score

Refresh: Daily

2.9 🧭 OPENSTREETMAP (OSM)
API: OpenStreetMap

Used For:
- POIs
- Roads
- Amenities

Stored: type, name, lat, lng, category

Derived: walkability_score, amenity_density, green_space_ratio

Refresh: Weekly

2.10 🏙️ MUNICIPAL OPEN DATA (MULTIPLE SOURCES)
Examples: Stockholm Open Data, Solna Open Data, Sollentuna Open Data, Järfälla Open Data

Used For:
- Construction plans
- Zoning changes
- Future developments

Stored: project_name, location, type, status, start_date, impact_level

Derived: growth_score, future_value_indicator

Refresh: Weekly/Monthly

3. INTERNAL SYSTEM APIs
3.1 SEARCH
GET /api/search?q=string
Response: { "address", "deso_id", "lat", "lng" }

3.2 NEIGHBORHOOD PROFILE
GET /api/neighborhood/:deso_id
Response: { "scores": { "overall", "transport", "safety", "schools", "environment", "growth" } }

3.3 ADDRESS RESOLUTION
GET /api/address?lat=&lng=
Uses: Lantmäteriet, SCB geodata

3.4 AI SUMMARY
POST /api/ai/summary
Input: { "deso_id", "scores" }
Output: { "summary", "pros", "cons", "recommendation" }

3.5 INVESTMENT ANALYSIS
POST /api/investment
Uses: SCB trends, municipal data, transport, crime

3.6 COMPARE NEIGHBORHOODS
GET /api/compare?a=deso1&b=deso2

4. DATA INGESTION APIs (INTERNAL)
These are CRITICAL for execution.

4.1 SCB INGESTION
POST /internal/ingest/scb

4.2 BRÅ INGESTION
POST /internal/ingest/bra

4.3 TRAFIKLAB INGESTION
POST /internal/ingest/trafiklab

4.4 SMHI INGESTION
POST /internal/ingest/smhi

4.5 OSM INGESTION
POST /internal/ingest/osm

4.6 MUNICIPAL DATA INGESTION
POST /internal/ingest/municipal

5. BACKGROUND JOB SCHEDULES
SCB → monthly
BRÅ → monthly
SMHI → daily
Trafiklab → daily
Trafikverket → hourly
OSM → weekly
Municipal data → weekly/monthly

6. DATA PIPELINE (FINAL)
[External APIs]
      ↓
[Ingestion Services]
      ↓
[Normalization Layer]
      ↓
[DeSO Mapping Engine]
      ↓
[PostGIS Storage]
      ↓
[Scoring Engine]
      ↓
[AI Summary Generator]
      ↓
[API Layer]
      ↓
[Frontend Dashboard]

7. WHAT THIS SPEC ENABLES
Once implemented, your system can answer:
🏠 "Is this a good place to live?"
📊 "Compare Kista vs Sollentuna"
🚆 "How good is transport here?"
🔐 "Is this area safe?"
📈 "Is this area improving or declining?"

8. IMPORTANT DESIGN DECISION
You are NOT building:
❌ Listing platform
❌ Marketplace
❌ Broker tool

You ARE building:
🧠 A Swedish geographic intelligence engine

RULE
always use nvm 22 which make node 22
always use venv for python related code

---

## 9. DATABASE SQL SCHEMA (PostGIS Optimized)

### 9.1 Core Tables

```sql
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
```

---

## 10. FASTIFY FOLDER STRUCTURE + MODULES

```
src/
├── server.ts
├── app.ts
├── plugins/
│   ├── cors.ts
│   ├── swagger.ts
│   └── database.ts
├── modules/
│   ├── search/
│   ├── neighborhoods/
│   ├── investment/
│   ├── ai/
│   ├── ingest/
│   └── compare/
├── lib/
│   ├── scoring/
│   ├── ai/
│   └── utils/
├── db/
│   ├── migrations/
│   └── seeds/
└── types/
```

---

## 11. EXACT SCORING ALGORITHM (PRODUCTION MATH MODEL)

### Weight Distribution:
- Demographics: 30%
- Housing Market: 20%
- Transport: 15%
- Schools: 10%
- Safety: 10%
- Green Areas: 5%
- Environment: 5%
- Future Growth: 5%

### Formulas:

**Demographics Score:**
```
demographics_score = (
  clamp((growth_pct - 0.5) / 3.5, 0, 1) * 0.4 +
  (median_income / stockholm_avg) * 0.3 +
  (higher_edu_pct / 100) * 0.2 +
  min(families_with_kids_pct / 60, 1) * 0.1
) * 100
```

**Housing Score:**
```
housing_score = (
  affordability_index * 0.4 +
  market_trend * 0.3 +
  inventory_health * 0.3
) * 100
```

**Safety Score:**
```
safety_score = 100 - (min(1, crime_per_capita / 0.01) * 0.7 +
              (trend_up ? 0 : trend_down ? 0.5 : 0) * 0.3) * 100
```

---

## 12. AI PROMPT SYSTEM (HIGH-QUALITY OUTPUTS)

### System Prompt:
```
You are the Swedish Neighborhood Intelligence AI. Provide data-driven insights based on official statistics only. Never invent data. Format responses with specific numbers, clear pros/cons, and actionable recommendations.
```

### Summary Prompt Template:
```
Generate a neighborhood summary for {areaName}. Overall: {overall}/100. Growth: {growth}%. Income: {income} SEK. Safety: {safety}/100. Transport: {transport}/100. Cover demographic profile, transport accessibility, school quality, and future outlook.
```

### Investment Prompt Template:
```
Analyze property investment in {areaName}. Price: {price} SEK, Size: {area} sqm. Determine if price is competitive, affordability vs median income, risk factors from trends, and future potential. Output format: VERDICT | PRICE | RISK | RECOMMENDATION
```

---

## 13. UI WIREFRAMES (REAL SCREENS)

### Landing Page:
- Hero search bar with autocomplete suggestions
- Featured neighborhoods grid (4 cards)
- AI assistant preview strip
- Data sources footer

### Neighborhood Report:
- Header with area name + circular overall score
- Score breakdown grid (schools, commute, green, safety, housing)
- Schools section with map + list
- Commute section with editable workplace
- Future development timeline
- Growth prediction + crime statistics

### Property Investment Page:
- Property details form (price, area, fee, area selector)
- Investment metrics cards (price/sqm, market position, affordability, risk)
- Commute to Stockholm with circular score
- Family score breakdown

---

## 14. BACKEND IMPLEMENTATION

### 14.1 Directory Structure
```
backend/
├── src/
│   ├── server.js              # Fastify entry point
│   ├── db/
│   │   └── migrations/        # SQL migrations
│   ├── modules/
│   │   ├── search/            # Address lookup
│   │   ├── neighborhoods/     # Area reports
│   │   ├── investment/        # Property analysis
│   │   ├── ai/                # LLM integration
│   │   ├── ingest/            # Data pipelines
│   │   └── compare/           # Area comparison
│   └── lib/
│       └── scoring/           # Scoring algorithms
python/
├── api.py                     # FastAPI service (venv)
├── scoring_engine.py            # Standalone scoring engine
├── requirements.txt
└── start.sh                   # Venv startup script
```

### 14.2 Startup Commands
Backend:
```bash
cd backend && npm install && npm run dev
```

Python AI Service:
```bash
cd python && source venv/bin/activate && uvicorn api:app --reload --port 8000
```
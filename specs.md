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

Endpoints:
/BE/BE0101 (population)
/HE/HE0110 (income)
/UF/UF0101 (education)

Refresh: Monthly batch job

2.2 🇸🇪 SCB GEODATA (DESO BOUNDARIES)
API: SCB Open Geodata

Used For:
- Neighborhood segmentation
- Spatial joins

Refresh: Rarely (static)

2.3 🗺️ LANTMÄTERIET (MAPS + PROPERTY GEODATA)
API: Lantmäteriet Open Data

Used For:
- Buildings
- Addresses
- Parcel boundaries

Refresh: Weekly

2.4 🚆 TRAFIKLAB (PUBLIC TRANSPORT)
API: Trafiklab APIs

APIs Used:
- SL Stop Lookup
- SL Journey Planner
- GTFS feeds

Refresh: Daily

2.5 🚦 TRAFIKVERKET (INFRASTRUCTURE)
API: Trafikverket API

Used For:
- Road works
- Rail disruptions
- Infrastructure projects

Refresh: Hourly

2.6 🚨 BRÅ (CRIME STATISTICS)
API: BRÅ Statistics

Used For:
- Crime rates
- Crime categories
- Historical trends

Refresh: Monthly

2.7 🏫 SKOLVERKET (EDUCATION)
API: Skolverket Open Data

Used For:
- School locations
- School performance
- School types

Refresh: Yearly

2.8 🌦️ SMHI (WEATHER + ENVIRONMENT)
API: SMHI Open Data

Used For:
- Weather trends
- Climate conditions
- Flood risk

Refresh: Daily

3. DATA INGESTION (FASTIFY)
POST /internal/ingest/scb
POST /internal/ingest/bra
POST /internal/ingest/trafiklab
POST /internal/ingest/skolverket
POST /internal/ingest/smhi
POST /internal/ingest/full

4. BACKEND IMPLEMENTATION
src/
├── server.js
├── db/connection.js
├── db/migrations/
│   └── 001_create_core_tables.sql
├── modules/
│   ├── search/
│   ├── neighborhoods/
│   ├── investment/
│   ├── ai/
│   ├── ingest/
│   └── compare/
└── lib/
    ├── ingestion/
    │   ├── engine.js      # Main ingestion class
    │   └── run.js         # CLI runner
    ├── collectors/
    │   ├── scb.js
    │   ├── trafiklab.js
    │   └── skolverket.js
    └── scoring/
        └── engine.js

5. PYTHON AI SERVICE (VENV)
python/
├── api.py               # FastAPI endpoints
├── scoring_engine.py      # Scoring algorithms
├── collectors/          # Reference only (not used)
├── requirements.txt
└── start.sh

6. STARTUP COMMANDS
Backend:
cd backend && npm install && npm run ingest && npm run dev

Python AI Service:
cd python && source venv/bin/activate && uvicorn api:app --reload --port 8000
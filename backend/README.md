# Backend Service - Swedish Neighborhood Intelligence

Fastify backend with PostgreSQL/PostGIS database.

## Setup

### Backend (Node.js/Fastify)
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database URL
npm run dev
```

### Python AI Service
```bash
cd python
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

## API Endpoints

### Swagger UI Documentation
Once the backend is running, visit:
```
http://localhost:3001/docs
```

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Search addresses/neighborhoods |
| GET | `/api/neighborhood/:deso_id` | Get neighborhood details |
| GET | `/api/neighborhood-score?deso_id=` | Get scores |
| POST | `/api/investment/analyze` | Property analysis |
| POST | `/api/ai/chat` | AI chat |
| POST | `/api/ai/summary` | AI summary |
| GET | `/api/compare?a=&b=` | Compare areas |
| POST | `/internal/ingest/scb` | SCB data ingestion |
| POST | `/internal/ingest/bra` | Crime data ingestion |

## Database Migration

Requires PostgreSQL with PostGIS extension.
```bash
psql -d neighborhood_intelligence -f src/db/migrations/001_create_core_tables.sql
```

## Architecture

```
backend/          # Fastify API server
├── src/
│   ├── server.js              # Entry point
│   ├── db/                    # Database connection + migrations
│   ├── modules/               # Route handlers
│   └── lib/                   # Scoring engine
python/           # FastAPI service (venv)
├── api.py                     # AI endpoints
├── scoring_engine.py            # Standalone scoring
└── start.sh                   # Venv startup
```
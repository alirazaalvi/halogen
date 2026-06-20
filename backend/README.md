# Neighborhood Intelligence Backend (Bun + TypeScript)

Fastify backend handling Swedish public API data collection and storage.

## Quick Start

```bash
# Install dependencies
bun install

# Set environment
cp .env.example .env

# Run ingestion engine
bun run ingest

# Start server
bun run dev
```

## Architecture

**Fastify Backend (TypeScript/Bun):**
- Handles all Swedish public API calls (SCB, Trafiklab, Skolverket, BRÅ, SMHI)
- Stores to PostgreSQL/PostGIS
- REST API endpoints
- Swagger docs: http://localhost:3001/docs

**Python AI Service (venv):**
- Scoring algorithms
- AI chat/summary generation
- Reads from database only

## Ingestion Engine

Located in `src/lib/ingestion/engine.ts`:

```typescript
const engine = new IngestionEngine();
await engine.ingestAll('123'); // deso_id
```

Endpoints:
- POST `/internal/ingest/full` - Full ingestion
- POST `/internal/ingest/scb` - SCB data
- POST `/internal/ingest/trafiklab` - Transport
- POST `/internal/ingest/skolverket` - Schools
- POST `/internal/ingest/bra` - Crime
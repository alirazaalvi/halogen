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
- Chat/summary text from supplied scores only; no scoring logic and no verdicts

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
## Data reliability

See `docs/specs/2026-10-17-data-reliability-spec.md`.

- No synthetic data: a source that fails or has no valid area-level data writes nothing and
  is recorded as `failed` or `skipped` (see `ingestion_runs` / `ingestion_steps`).
- Currently real: SCB DeSO population, Skolverket school locations, Trafiklab stops (needs
  `TRAFIKLAB_API_KEY`). Crime, environment, building data and projects are `skipped`.
- Scores come from `src/lib/scoring/score.ts`: components without data are `null`, the
  overall score uses only available components and is withheld below 50% coverage.
- The CLI exits non-zero when any step failed.

```bash
bun run src/lib/ingestion/run.ts rescore     # recompute scores from stored data, no network
bun test                                      # includes a guard against synthetic data
```

Other commands:

```bash
bun run src/lib/ingestion/run.ts check-data                       # sanity + freshness, non-zero on errors
bun run src/lib/ingestion/run.ts scb-describe <PxWeb table URL>  # list variable/value codes
```

SCB indicators (income, education, foreign born, families) are configured in
`src/lib/ingestion/pxweb-indicator.ts`. A spec is only used if every code in it exists in
the live table metadata; none are configured until their codes have been confirmed.

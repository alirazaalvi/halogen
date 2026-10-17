# Deploying on Cloudflare (serverless)

```
Browser ──► Worker "halogen-web"   static SPA (frontend/dist)
   │
   └──────► Worker "halogen-api"   Hono, read API  ──Hyperdrive──► Postgres + PostGIS (Neon / Supabase)
                                                                      ▲
Ingestion (CLI, GitHub Action or any host) ───────────────────────────┘
```

- **Web**: `frontend/` is a static Vite app served by Workers static assets with SPA fallback.
- **API**: `backend/src/worker.ts`. The same route modules also run under Fastify
  (`bun run dev`), through a small adapter (`src/lib/http`). Search, area details, compare,
  investment and the text endpoints (`/api/ai/*`, generated in-process; there is no separate
  AI service any more).
- **Database**: Workers cannot host Postgres, and D1 (SQLite) has no PostGIS, which the
  queries need. Use a hosted Postgres with PostGIS and connect through **Hyperdrive**.
- **Ingestion** is not a Worker (it runs for hours and makes thousands of requests). It runs
  from the CLI or the `Ingest data` workflow against the same database. The internal
  `/internal/ingest/*` HTTP endpoints exist only in the Fastify server and are not deployed
  to Workers.

## 1. Database

1. Create a Postgres database with PostGIS (Neon or Supabase) and note its connection string.
2. Move the data from the current database (see below), or start empty and run migrations:
   `DATABASE_URL=<target> bash backend/scripts/db-migrate.sh`.

### Moving existing data

On the machine that has the current database:

```bash
cd backend
DATABASE_URL=postgresql://<current> bash scripts/db-migrate.sh   # clean-up migrations 019-021
DATABASE_URL=postgresql://<current> bash scripts/db-dump.sh      # -> backups/<timestamp>/
TARGET_DATABASE_URL=postgresql://<new> bash scripts/db-restore.sh backups/<timestamp>
```

- The dump refuses to run until migrations 019-021 are applied, so removed synthetic rows
  are not carried over (`ALLOW_UNMIGRATED=1` overrides).
- It writes `halogen.dump` (custom format), `schema.sql`, `row-counts.txt` and `SHA256SUMS`.
  The restore checks the checksums and compares row counts for every table.
- The restore needs an empty target (or `FORCE=1`) and enables PostGIS.
- `backups/` is git-ignored. Do not commit dumps.

## 2. API worker

```bash
cd backend
bun install
npx wrangler login
npx wrangler hyperdrive create halogen-db --connection-string="postgres://USER:PASS@HOST/DB"
# put the returned id into wrangler.jsonc ("hyperdrive"[0].id), set ALLOWED_ORIGIN to the web origin
bun run cf:build      # bundle only, no deploy
bun run cf:deploy
curl https://halogen-api.<account>.workers.dev/health
```

Local run against a local database: `bun run cf:dev` (uses `localConnectionString`).

## 3. Web

```bash
cd frontend
npm ci
VITE_BACKEND_API_URL=https://halogen-api.<account>.workers.dev npm run cf:deploy
```

## 4. After the first deploy

```bash
DATABASE_URL=<new> bun run src/lib/ingestion/run.ts rescore       # recompute scores
DATABASE_URL=<new> bun run src/lib/ingestion/run.ts check-data    # sanity + freshness
```

GitHub Actions: `Deploy to Cloudflare` and `Ingest data` are manual workflows. Secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, optional `TRAFIKLAB_API_KEY`;
variable `API_URL`.

## Verified in development / not verified

Verified: the Worker bundles (about 740 KiB, 136 KiB gzipped); it runs in the local Workers
runtime (`wrangler dev`) and answered `/health`, `/api/ai/chat`, `/api/ai/summary` and
`/api/investment/analyze` against a local Postgres through the Hyperdrive binding; the dump
and restore scripts round-trip a test database with checksum and row-count verification.

Not verified: any deployment to a real Cloudflare account, a real Hyperdrive config, and the
PostGIS-based routes (`/api/search`, `/api/neighborhood/*`, `/api/compare`) in the Workers
runtime, because the sandbox has no PostGIS. They use the same `pg` client path as the
verified routes. Check them first after deploying.

# Data Reliability Specification

- Status: Active
- Date: 2026-10-17
- Scope today: **Stockholm County**. Planned: **Sweden-wide**, then the **UK**.
- Origin: audit of the repository at commit `3bfb9ca`.

## 1. Purpose

Halogen scores neighbourhoods from public data. The audit found that most inputs to those
scores are generated numbers (hash-derived pseudo-random values) stored under real source
labels ("SCB", "Brå", "Skolverket"), and that failures are swallowed. This spec defines the
requirements that make every number shown to a user either **measured**, clearly
**estimated**, or explicitly **missing**.

## 2. Principles

1. **No synthetic data in any data path.** A value is real, derived from real values with a
   documented method, or absent. Never invented.
2. **Absent is a valid state.** `NULL` and `missing` are preferred over a plausible default.
3. **Failure is loud.** A failed source is recorded, surfaced and reflected in the exit code.
4. **Provenance travels with the number.** Source, as-of period and quality status are
   exposed through the API and the UI.
5. **Country-agnostic core.** Country specifics (area unit, sources, currency, scales) live in
   adapters and configuration, never in shared scoring or API code.

## 3. Findings and requirements

Status legend: **Implemented** (done on this branch, covered by tests), **Specified**
(requirement fixed, not yet built; reason given).

### 3.1 Synthetic data (P0)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-01 | `areaFactor/areaInt/areaTrend/areaAnchor` generate hash-based values used as data (income, education, crime, school performance, student counts, building years, coordinates, route counts, SMHI fields, project confidence). | These helpers are removed. Ingestion code must not derive any stored value from an identifier hash. A static test fails the build if they reappear. | Implemented |
| DR-02 | `buildDemographicProfile` fabricates income, education, foreign-born %, family % and growth. | Only values present in a source response are stored; every other field is `NULL`. | Implemented |
| DR-03 | `ingestCrime` writes a generated incident count labelled "Brå". | Crime ingestion is disabled until a real source exists. No rows are written. The safety score is `null`. | Implemented |
| DR-04 | School `performance` and `student_count` fall back to generated values when the register lacks them. | Stored as `NULL` when absent. | Implemented |
| DR-05 | `catch` blocks across `ingest*` insert invented stops, schools, addresses, SMHI rows and projects. | A failed fetch writes nothing and is reported (DR-20). Existing rows are never overwritten by a failed run. | Implemented |
| DR-06 | SMHI ingestion stored one national latest-hour temperature as every area's annual average, mixed with hashed flood, green, air, rainfall and wind values. | Environment ingestion is disabled and reported as `skipped`. Existing hashed values are cleared. Environment and green scores stay `null` until area-level sources exist (DR-30). | Implemented |
| DR-07 | The "future projects" feed was the Stockholm data portal's *dataset catalogue* (records matching "projekt"), attached identically to every area, with hashed `confidence`, hard-coded fallback projects and invented coordinates. The API also invented projects when none existed. | Project ingestion is disabled and reported as `skipped` until an area-level project source exists. The API returns an empty list. Confidence is `NULL` unless a source provides it. | Implemented |
| DR-08 | Migrations 005, 006, 008, 010 seed hand-typed demographic values. | Documented as legacy seed data; they are flagged `quality = 'seed'` and excluded from scoring (DR-14). | Implemented |

### 3.2 Scoring (P0)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-10 | Missing inputs are replaced by defaults (250 incidents, 350 000 SEK, air 50, temperature 8). | Missing inputs yield a `null` component score, never a default. | Implemented |
| DR-11 | Overall score weights all components even when some are fake or absent. | The overall score is computed from available components only, with weights re-normalised. | Implemented |
| DR-12 | No indication of how much of a score is backed by data. | Each score stores `data_coverage` (0–1), `components_available`, `components_missing` and `scoring_version`. A minimum coverage (default 0.5) is required to publish an overall score. | Implemented |
| DR-13 | The "housing market" score is building age plus address count; no price data. | Labelled "Housing stock" in the UI and documented as a stock indicator (the column name is unchanged for compatibility). Market data is out of scope until DR-31. | Implemented |
| DR-14 | Seed or fallback rows can flow into scores. | Scoring reads only rows with `quality IN ('measured','derived')`. | Implemented |
| DR-15 | TypeScript and Python scoring engines disagree on weights. | One source of truth: the TypeScript scoring module. The Python service no longer computes verdicts or weights of its own. | Implemented |
| DR-16 | Scoring constants (600 000 SEK, 62–96) are Stockholm-specific. | Constants live in a versioned config object. Country-relative normalisation is a Phase 2 item (DR-40). | Specified |

### 3.3 Failure handling and provenance (P0/P2)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-20 | About 15 silent `catch` blocks; runs report `ok` when sources failed. | Every ingestion step records `ok`, `partial`, `failed` or `skipped` with row counts in `ingestion_runs`. | Implemented |
| DR-21 | Missing API keys are not detected. | Steps that need a key report `skipped` with reason `missing_api_key`. | Implemented |
| DR-22 | The CLI exits 0 when sources failed. | The CLI exits non-zero when a required step fails. | Implemented |
| DR-23 | Rows have `source_links` only; no quality or as-of. | Core data tables carry `quality` (`measured`, `derived`, `estimated`, `seed`) and `fetched_at`. | Implemented |
| DR-24 | The API hides provenance. | Score endpoints return `coverage`, `missing` and `scoringVersion`. | Implemented |
| DR-25 | SCB population is requested for the current calendar year, which may not be published. | The latest published period is read from table metadata. | Implemented |

### 3.4 API and frontend fallbacks (P0)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-50 | `fallbackDemographics` and `fallbackFutureProjects` derive "evidence" from the score itself. | Removed. Missing data is returned as `null` / empty. | Implemented |
| DR-51 | Investment analysis uses constant price per m² and hard-coded commute times. | Constants removed. Fields are `null` with `available: false` until real data exists. | Implemented |
| DR-52 | AI and summary routes return canned text on failure. | They return `503` with `error.code = "AI_UNAVAILABLE"`. | Implemented |
| DR-53 | Frontend ships `areas.ts` sample data and `buildFallbackArea`. | The UI shows "no data" states for missing values and never renders invented values. | Implemented |
| DR-54 | A debug `fetch` to `127.0.0.1:7777` is left in the area route. | Removed. | Implemented |

### 3.5 Tests and CI (P3)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-60 | Almost no tests for ingestion or scoring. | Unit tests for scoring, SCB period selection and run recording. | Implemented |
| DR-61 | No CI. | GitHub Actions runs lint, typecheck and tests for backend, scb-mcp and frontend. | Implemented |
| DR-62 | Nothing prevents synthetic data from returning. | A static guard test scans `backend/src` for banned helpers and `generated:true`/`fallback:true` markers. | Implemented |
| DR-63 | Sanity checks on loaded data. | Range and total-consistency checks (e.g. DeSO populations vs municipality). | Specified (needs live data) |
| DR-64 | Freshness monitoring. | Alert when a source is older than its cadence. | Specified (needs run history in production) |

### 3.6 Real data sources (Phase 1, needs live access)

These replace removed synthetic values. They require network access and API keys that were
not available when this spec was implemented, so they are specified here, not built. Table
identifiers must be confirmed against live metadata (use `scb-mcp`) before coding.

| ID | Metric | Source (Stockholm) | Notes |
|---|---|---|---|
| DR-30 | Environment: flood, green space, air | Länsstyrelsen flood layers, Lantmäteriet/Naturvårdsverket land cover, SMHI | Compute against DeSO polygons in PostGIS |
| DR-31 | Housing prices | SCB property price statistics, or licensed (Booli/Hemnet) | Licensing decision required |
| DR-32 | Income, education, foreign background at DeSO | SCB PxWeb (DeSO tables) | Use latest period from metadata |
| DR-33 | School results | Skolverket planning and follow-up (SIRIS) | Grades, merit value, eligibility, pupils |
| DR-34 | Safety | Polisen vulnerable-areas list, Brå NTU, municipal crime figures | Crime counts at DeSO level are not public; be explicit about level |
| DR-35 | Transport | Trafiklab GTFS Regional static feed | Point-in-polygon assignment to DeSO |
| DR-36 | Future projects | Municipal feeds | Keep `confidence` only if the source gives it |

### 3.7 Data model hygiene (Phase 2)

| ID | Requirement | Status |
|---|---|---|
| DR-40 | Country-relative percentile normalisation of scores. | Specified |
| DR-41 | One canonical area key; retire the `districts` / `deso_compat` layer. | Specified |
| DR-42 | Point-in-polygon school and stop assignment everywhere; remove `id LIKE '<deso>-%'` matching. | Partially implemented: the DeSO flow now assigns schools and stops by polygon containment. The legacy district flow still assigns schools to the nearest centroid (rows are marked `derived`). |
| DR-43 | Search returns one result per real place (Kista currently appears three times). | Specified |

### 3.8 Multi-country design (Sweden, then UK)

- **DR-70 Country adapter.** Interface with `listAreas`, `demographics`, `schools`, `safety`,
  `transport`, `housing`, `environment`. Sweden wraps SCB, Skolverket, Brå/Polisen, Trafiklab,
  SMHI. UK equivalents: ONS/Nomis, DfE and Ofsted, Police.uk, NaPTAN/BODS, HM Land Registry,
  Environment Agency.
- **DR-71 Generic area model.** `areas(country, level, parent_id, geometry)` with levels such
  as `deso` (SE) and `lsoa`/`msoa` (UK).
- **DR-72 Metric registry.** Metric id, unit, direction, source and per-country mapping stored
  as data.
- **DR-73 Locale and currency.** SEK/GBP, terminology and language in configuration.
- **DR-74 Licensing review** before each new source is added.
- **DR-75** Shared code must not reference Stockholm county codes, DeSO ids or SEK constants.
  The static guard (DR-62) is extended to flag them once the adapter exists.

### 3.9 Additional findings made during implementation

| ID | Finding | Resolution | Status |
|---|---|---|---|
| DR-80 | SCB ingestion queried a municipality/county table and stored the county total as each DeSO's population. | Population now comes from DeSO table `FolkmDesoAldKon` (`scb-population.ts`), latest published year, with growth from the previous year. | Implemented |
| DR-81 | Trafiklab was queried around a hash-derived coordinate, not the area; Lantmäteriet used one unscoped feed attached to whichever area was running. | Trafiklab uses the stored DeSO centroid. Lantmäteriet ingestion is disabled until an area-scoped source exists. | Implemented |
| DR-82 | Every school of a municipality was stored under every DeSO; schools without coordinates received a generated location. | Schools are assigned by polygon containment; unlocated schools are stored without coordinates. Migration 020 removes mis-assigned rows. | Implemented |
| DR-83 | Transport scoring matched stops by `id LIKE '<deso>-%'`, so real stops (with SL/ResRobot ids) never counted. | Spatial join against the DeSO polygon. | Implemented |
| DR-84 | District scores hard-coded transport 80, housing 78 and green 75. | Components without inputs are `null`. | Implemented |
| DR-85 | Nearest-centroid school assignment for legacy districts (capped at 8) is a heuristic. | Rows are marked `derived`; replace with containment (DR-42). | Open |
| DR-86 | `ensureMunicipality` hard-codes municipality populations; pilot named-district centroids are hand-typed. | None yet. | Open |
| DR-87 | API detail responses invented schools, commute minutes, average age, ownership share and a "1.0 km" distance. | Removed. | Implemented |
| DR-88 | Debug instrumentation read a developer's home directory and posted to `127.0.0.1:7777` from production routes. | Removed. | Implemented |
| DR-89 | `Number(null)` is `0`, so missing scores rendered as 0 in the UI. | Null-safe formatting and nullable view models. | Implemented |

## 4. Verification status

Verified in the development sandbox:
- Backend lint, typecheck and 58 unit tests, including the synthetic-data guard.
- Migration 019 against a stub schema on PostgreSQL 16 (classification, clean-up, idempotence).
- Frontend lint, typecheck, build and unit tests; Python import and the rewritten responses.

Not verified (no PostGIS server and no outbound access to SCB, Skolverket, Trafiklab):
- Migration 020 and the PostGIS queries (containment, spatial join).
- The SCB request/response handling against the live API. It follows the table metadata in
  `scb-mcp/data/scb-catalog.json` and is unit-tested against a JSON-stat fixture.
- A full ingestion run. After deploying: apply migrations, run `ingest`, then `rescore`.
- The CI `migrations` job, which applies every migration to an empty PostGIS database.

Expected effect: until Phase 1 sources (3.6) are connected, most areas have too little data
for an overall score (coverage below 50%), so the UI shows "no data" instead of a number.
This is intended.

All items marked Specified or Open remain open work.

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
| DR-06 | SMHI observation mixes one real temperature with hashed flood, green, air, rainfall and wind. | Only the measured temperature is stored; other fields are `NULL` until a real source exists (DR-30). | Implemented |
| DR-07 | Projects get a hashed `confidence`; the API invents projects when none exist. | `confidence` is `NULL` unless the source provides one. The API returns an empty list, never invented projects. | Implemented |
| DR-08 | Migrations 005, 006, 008, 010 seed hand-typed demographic values. | Documented as legacy seed data; they are flagged `quality = 'seed'` and excluded from scoring (DR-14). | Implemented |

### 3.2 Scoring (P0)

| ID | Finding | Requirement | Status |
|---|---|---|---|
| DR-10 | Missing inputs are replaced by defaults (250 incidents, 350 000 SEK, air 50, temperature 8). | Missing inputs yield a `null` component score, never a default. | Implemented |
| DR-11 | Overall score weights all components even when some are fake or absent. | The overall score is computed from available components only, with weights re-normalised. | Implemented |
| DR-12 | No indication of how much of a score is backed by data. | Each score stores `data_coverage` (0–1), `components_available`, `components_missing` and `scoring_version`. A minimum coverage (default 0.5) is required to publish an overall score. | Implemented |
| DR-13 | The "housing market" score is building age plus address count; no price data. | Renamed in the API contract to a *housing stock* indicator; it is not presented as market data. Market score stays `null` until price data exists (DR-31). | Implemented |
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
| DR-42 | Point-in-polygon school and stop assignment everywhere; remove `id LIKE '<deso>-%'` matching. | Specified |
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

All items marked Specified remain open work.

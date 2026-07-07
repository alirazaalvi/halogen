# SCB API Index And MCP Design

## Goal
Build a project-local SCB catalog and MCP service that can:
- index SCB open-data surfaces and their discoverable datasets
- recommend the best SCB API for a given use case
- answer project queries from the most appropriate SCB source
- keep future source choices consistent through a repo memory file

## Problem
SCB exposes multiple open-data surfaces with different query models:
- `PxWeb` for tabular statistics
- `Open geodata` for WFS, WMS, and downloadable spatial datasets
- `Myndighetsregistret`
- `Branschnyckeltal`
- `Värdefulla datamängder`

The current repo has ingestion code that already depends on SCB, but it has no source catalog, no explicit source-ranking logic, and no MCP server. As a result, future implementation work risks choosing weaker or less appropriate SCB sources when better official ones already exist.

## Scope
- Create a searchable SCB API catalog for all SCB open-data surfaces exposed from the SCB open-data entry pages.
- Rank and recommend the best SCB source for a requested use case.
- Implement first-phase MCP tools for:
  - SCB dataset discovery
  - API recommendation
  - PxWeb metadata lookup
  - PxWeb query execution
  - geodata catalog lookup
  - geodata download discovery
- Record SCB source decisions and implementation preferences in a project memory file.

## Out Of Scope
- Replacing the existing backend REST API with MCP.
- Full first-day live support for every SCB surface beyond the initial prioritized tools.
- Automatic ingestion of every SCB dataset into PostgreSQL.
- Building a user-facing frontend for the SCB catalog.

## Source Inventory
The catalog should index the official SCB open-data entry points and their sub-surfaces.

### 1. Open Data Root
Primary overview page for SCB open data:
- `https://www.scb.se/vara-tjanster/oppna-data/`

This page is the top-level discovery source and should be treated as the root of the index.

### 2. PxWeb / Statistical Database
Best source for official tabular statistics and variable-based data queries.

Expected characteristics:
- hierarchical table discovery
- table metadata
- variable/value selection
- structured JSON result queries
- rate-limited official API surface

This is the preferred source for:
- population
- income
- education
- labor
- household
- other numeric statistical tables

### 3. Open Geodata
Best source for geometry, spatial layers, and downloadable official geographic datasets.

Expected characteristics:
- WFS/WMS capability-driven discovery
- downloadable geopackage links
- official polygon and spatial metadata datasets

This is the preferred source for:
- DeSO polygons
- RegSO polygons
- grid statistics
- localities and small localities
- other official SCB spatial layers

### 4. Government Agencies Register
Should be indexed in the catalog as a dedicated SCB data surface, even if first-phase tooling is metadata-first.

### 5. Industry Ratios
Should be indexed in the catalog as a dedicated SCB data surface, even if first-phase tooling is metadata-first.

### 6. High-Value Datasets
Should be indexed in the catalog as a dedicated SCB data surface, even if first-phase tooling is metadata-first.

## Recommendation Rules
The MCP should not merely search; it should recommend the strongest source.

### Preferred Source By Use Case
- tabular official statistics -> `PxWeb`
- polygon or map layer discovery -> `Open geodata`
- DeSO or RegSO boundaries -> `Open geodata`
- dataset capability discovery for WFS/WMS -> `Open geodata`
- official agency registry queries -> `Myndighetsregistret`
- company ratio datasets -> `Branschnyckeltal`
- EU high-value dataset discovery -> `Värdefulla datamängder`

### Ranking Criteria
The recommendation score should prefer:
1. official SCB surface match
2. direct machine-queryable endpoint availability
3. structured metadata availability
4. explicit geographic or statistical fit to the request
5. lower transformation cost for this project

### Recommendation Output
Every recommendation response should include:
- recommended source family
- confidence score
- reason summary
- canonical URL
- fallback alternatives when relevant

## Architecture
Implement the SCB MCP as a separate repo-local service instead of merging it into the existing Fastify backend.

### Why Separate
- the repo currently has no MCP scaffold
- the existing backend is application-serving and ingestion-oriented
- the MCP has a different responsibility: discovery, recommendation, and source-aware querying
- separation keeps the future tool boundary clear and avoids mixing app routes with MCP transport concerns

### Proposed Location
Create a new top-level workspace such as:

```text
scb-mcp/
```

Suggested structure:

```text
scb-mcp/
  src/
    catalog/
    fetchers/
    ranking/
    tools/
    server.ts
  data/
    scb-catalog.json
  package.json
  tsconfig.json
```

## Catalog Model
Persist a local generated index file so the MCP can answer discovery questions quickly and consistently.

### Catalog Entry Shape

```json
{
  "id": "scb-open-geodata-deso-2025",
  "title": "DeSO 2025",
  "source_family": "open_geodata",
  "surface": "DeSO",
  "canonical_url": "https://www.scb.se/...",
  "capabilities_url": "https://geodata.scb.se/...",
  "query_style": "wfs-download",
  "formats": ["wfs", "wms", "geopackage"],
  "coverage": "Sweden",
  "version_hint": "2025",
  "best_for": ["deso-boundaries", "polygon-lookup", "spatial-joins"],
  "priority": "high",
  "notes": "Preferred source for official DeSO polygons."
}
```

### Minimum Fields
- `id`
- `title`
- `source_family`
- `surface`
- `canonical_url`
- `query_style`
- `formats`
- `best_for`
- `priority`
- `notes`

### Optional Fields
- `capabilities_url`
- `download_urls`
- `metadata`
- `coverage`
- `version_hint`
- `rate_limit_notes`
- `language`

## Catalog Build Strategy
Build the catalog from official SCB open-data landing pages plus selected capabilities and download links.

### Phase 1 Collection
- crawl the open-data overview page
- collect first-level SCB surface pages
- collect geodata subpages that describe official downloadable layers
- capture PxWeb entry points and metadata roots
- normalize the discovered pages into structured catalog entries

### Phase 1 Persistence
- write the normalized result to a committed or generated JSON file in the MCP workspace
- include a refresh timestamp and source URLs
- keep the format deterministic so diffs stay readable

### Refresh Model
- manual refresh script for now
- rerunnable and idempotent
- expected usage when SCB updates datasets or versions

## MCP Tool Surface
The first release should expose a small set of sharp tools.

### `scb_search_catalog`
Purpose:
- search indexed SCB surfaces and datasets by keyword or use case

Inputs:
- free-text query
- optional source-family filter
- optional best-for tag filter

Returns:
- ranked list of catalog entries
- short explanation for why each result matched

### `scb_recommend_api`
Purpose:
- recommend the strongest SCB source for a specific user intent

Inputs:
- free-text task description
- optional preferred output type such as `table`, `geometry`, `download`, or `metadata`

Returns:
- top recommendation
- confidence score
- fallback options
- explanation

### `scb_get_pxweb_metadata`
Purpose:
- inspect PxWeb table or node metadata

Inputs:
- table or metadata URL

Returns:
- variables
- value dimensions
- table description
- query guidance

### `scb_query_pxweb`
Purpose:
- execute a bounded PxWeb query against a selected table

Inputs:
- table URL
- variable selections
- optional output format preferences

Returns:
- structured response payload
- normalized summary
- source metadata

Guardrails:
- respect SCB rate limits
- apply bounded result sizes
- reject obviously oversized requests

### `scb_get_geodata_catalog`
Purpose:
- return relevant open-geodata datasets for a spatial topic

Inputs:
- free-text query
- optional layer family like `deso`, `regso`, `grid`, `localities`

Returns:
- matching geodata entries
- known formats
- capabilities URLs
- download options

### `scb_get_dataset_downloads`
Purpose:
- surface downloadable files or service links for a known dataset

Inputs:
- catalog entry id or canonical URL

Returns:
- download URLs
- service URLs
- version hints
- notes

## Error Handling
- Never invent SCB endpoints that are not present in the catalog or directly discoverable from official SCB sources.
- Distinguish between:
  - catalog miss
  - source unavailable
  - rate-limit rejection
  - unsupported dataset type
  - oversized query
- Return actionable fallback suggestions when the recommended source cannot serve the request directly.

## Rate Limits And Safety
Respect SCB’s published usage rules.

### Constraints
- cap outbound calls to remain under SCB’s stated rate limits
- cache metadata responses where practical
- bound result sizes for live queries
- prefer metadata discovery over full data pulls when the question is exploratory

### Default Behavior
- metadata lookups are allowed by default
- large data pulls require explicit bounded query parameters
- if a query risks crossing dataset limits, return guidance rather than brute-forcing

## Project Memory File
Start a repo-level memory file so future implementations do not repeat source selection work.

### Proposed Path
`docs/PROJECT_MEMORY.md`

### Initial Sections
- active architectural decisions
- user preferences
- preferred data sources
- rejected approaches
- operational constraints
- next likely follow-ups

### Initial SCB Entries
- prefer `PxWeb` for official tabular statistics
- prefer `Open geodata` for DeSO, RegSO, and other spatial layers
- keep the SCB root page as the discovery root
- avoid assuming non-official mirrors when an official SCB surface exists
- keep MCP separate from the Fastify backend

## Testing
Testing should focus on correctness of discovery and recommendations rather than broad mock-heavy coverage.

### Targeted Checks
- catalog build produces stable normalized entries from official SCB pages
- recommendation logic chooses `PxWeb` for tabular statistical requests
- recommendation logic chooses `Open geodata` for polygon and DeSO requests
- PxWeb metadata tool parses variables and dimensions correctly
- oversized or unsupported queries fail with clear guidance

### Manual Verification
1. build or refresh the SCB catalog
2. search for `DeSO`, `population`, and `agency register`
3. confirm the recommended source matches the documented ranking rules
4. run a small PxWeb query and confirm the result shape is usable
5. confirm geodata discovery returns official service or download links

## Rollout Plan
1. Create the spec and memory-file convention.
2. Add the new `scb-mcp` workspace.
3. Implement catalog fetchers and normalizers.
4. Generate the initial SCB catalog index.
5. Implement recommendation logic.
6. Expose the first MCP tools.
7. Validate with a few project-relevant SCB requests.

## Risks
- SCB surface structures may evolve, especially around PxWeb versions or web-page layouts.
- Some SCB surfaces may require more custom parsing than the first release should absorb.
- Over-indexing pages without clear structured metadata can create noisy catalog entries.
- Geodata capabilities may be better discovered from service URLs than from static landing pages alone.

## Recommendation
Implement a curated SCB MCP:
- index all SCB open-data surfaces in metadata
- support live project-focused retrieval first for `PxWeb` and `Open geodata`
- rank sources explicitly instead of relying on ad hoc future choices
- persist the decision trail in `docs/PROJECT_MEMORY.md`

This gives the project a single reliable place to discover SCB sources, choose the right official API, and answer future Sweden-data questions without redoing the same research.

# Project Memory

## User Preferences
- Do not auto-load the `brainstorming` skill unless it is truly required by the system workflow.
- Keep implementation decisions documented so future sessions can continue without repeating the same discovery work.
- Prefer official upstream sources over ad hoc mirrors when a stronger canonical source exists.

## Product Scope & Roadmap
- Current scope is **Stockholm County only**. Planned expansion: **Sweden-wide first, then the UK**.
- Design data model, ingestion, scoring, and provenance so country-specific parts (area units, sources, scales) are pluggable. Do not hard-code Stockholm/SCB/DeSO assumptions into shared code paths.
- Data reliability rule: never present generated/fallback values as real data. Every metric must carry source, as-of date, and a real/estimated/missing status.

## Active Decisions
- SCB source discovery now has a dedicated standalone MCP service under `scb-mcp/`.
- Keep the SCB MCP separate from the existing Fastify backend so the app runtime and MCP runtime stay decoupled.
- Use the SCB open-data root as the top-level discovery page.
- Prefer `PxWeb` for official tabular statistics.
- Prefer `Open geodata` for DeSO, RegSO, grid statistics, and other spatial datasets.

## Operational Constraints
- Respect SCB rate limits: published guidance indicates 10 requests per 10 seconds from one IP and a maximum of 100,000 values per table.
- For stdio MCP servers, write operational logs to `stderr`, not `stdout`.
- Keep catalog refresh idempotent and deterministic so regenerated files are reviewable in git diffs.

## Current Implementation Notes
- The first MCP release should expose tools for catalog search, source recommendation, PxWeb metadata lookup, PxWeb query execution, geodata catalog lookup, and dataset download discovery.
- The catalog should live in `scb-mcp/data/scb-catalog.json`.
- The initial implementation should stay project-focused: broad metadata coverage across SCB surfaces, with live retrieval centered on `PxWeb` and `Open geodata`.
- PxWeb deep discovery now targets the population subtree needed for lower-than-municipality statistics, especially `BE/BE0101/BE0101Y`.
- Treat the requested district-list fetch as official `DeSO` list retrieval, not informal municipality neighborhood names.
- For list retrieval, prefer the PxWeb DeSO table branch; for geometry and polygons, still prefer SCB Open Geodata.
- Backend Stockholm coverage now treats official SCB `deso_areas` as canonical and keeps `districts` as a compatibility layer with `DESO-<deso_id>` rows linked by `districts.deso_id`.
- Stockholm county district coverage should be seeded from the SCB PxWeb DeSO list plus SCB Open Geodata `DeSO_2025` geometry, not legacy municipality placeholder districts.
- User-facing Stockholm district names should come from an alias layer synced during ingestion; keep DeSO IDs canonical internally, prefer curated neighborhood aliases in API responses and search, and fall back to generated DeSO labels only when no alias exists.

## Rejected Approaches
- Do not make the existing Fastify backend double as the MCP server.
- Do not start with every SCB surface as a full live integration on day one.
- Do not assume informal third-party SCB mirrors when official SCB endpoints exist.

## Next Likely Follow-Ups
- Expand the catalog builder to discover more structured dataset metadata from PxWeb nodes.
- Add optional HTTP transport for remote MCP hosting after the stdio server is stable.
- Consider connecting the SCB MCP back into ingestion workflows once the catalog and ranking logic are proven.

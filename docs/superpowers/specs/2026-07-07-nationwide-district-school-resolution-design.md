# Nationwide District School Resolution Design

## Goal
Make district-level school data correct and scalable across Sweden by resolving schools with a generic quality ladder:
- use district geometry when available
- use district-scoped ingested schools when geometry is missing
- fall back to DeSO-backed logic only as a last resort

This should fix current pilot issues and provide a repeatable path for future municipalities outside Stockholm.

## Problem
The project now has a mixed district model:
- `named_districts` with official geometry for Stockholm
- `seeded_centroid` districts with `legacy_district_id` fallback for Sollentuna, Solna, and Sundbyberg

School lookup behavior is inconsistent across those shapes:
- official districts can still use DeSO-backed schools even when polygon geometry exists
- seeded districts can leak nearby but incorrect schools if municipality scope or district filtering is weak
- a one-off Stockholm-specific solution would solve today's issue but break the nationwide expansion path

The product needs one district-school strategy that works for:
- high-quality geometry-backed municipalities
- centroid-only pilot municipalities
- future municipalities with partial or incomplete district data

## Decision
Implement a generic district school resolution ladder driven by district data quality, not municipality name:

1. `geometry_match`
   - if a `named_district` has usable polygon geometry, match schools by polygon containment
   - optionally include a small proximity buffer for edge schools near district borders
2. `district_scoped_ingestion`
   - if a `named_district` lacks polygon geometry but has `legacy_district_id`, ingest municipality schools and store district-scoped school rows filtered by district centroid/radius
   - read those district-scoped rows first at runtime
3. `deso_fallback`
   - if neither of the above produces usable schools, fall back to the current `named_district_deso_map -> schools.deso_id` path

This ladder should be visible internally in verification output so weak districts can be identified and improved later.

## Scope
- Define a reusable school resolution strategy for all `named_districts`.
- Add verification tooling for district-level school coverage and quality.
- Update runtime school selection to prefer the best available district-quality tier.
- Add or refine ingestion paths needed to populate district-scoped schools when geometry is missing.
- Apply the strategy first to Stockholm municipality `0180`, then reuse it for future municipalities.

## Out Of Scope
- Rebuilding the entire district model for all Sweden in one pass.
- Replacing DeSO as the canonical statistics layer.
- Solving user-facing district naming for every municipality in Sweden.
- Ingesting non-school point datasets with the same ladder in this phase.

## Data Quality Tiers

### Tier 1: Geometry-Backed Named Districts
Use when:
- `named_districts.geometry IS NOT NULL`

Resolution rule:
- select schools whose coordinates fall inside the district geometry
- if needed, add a small configurable near-boundary buffer
- rank by distance to district centroid, then school quality fields already used in the app

Expected municipalities:
- Stockholm `0180`
- future municipalities with official district polygons

### Tier 2: District-Scoped Ingested Schools
Use when:
- `named_districts.geometry IS NULL`
- `named_districts.legacy_district_id IS NOT NULL`

Resolution rule:
- ingest the municipality's school pool from Skolverket
- filter by distance to the named-district centroid
- store the selected schools with `schools.district_id = legacy_district_id`
- read those district-scoped rows before any DeSO fallback

Expected municipalities:
- current seeded pilot districts such as `Rissne`, `Hallonbergen`, and `Hagalund`
- future municipalities that only have seed centroids or lightweight district definitions

### Tier 3: DeSO Fallback
Use when:
- no geometry-backed match exists
- no district-scoped school rows exist

Resolution rule:
- use `named_district_deso_map` to fetch schools via `schools.deso_id`
- keep this as a compatibility fallback only

Expected use:
- temporary support while a municipality is being upgraded
- partial coverage municipalities during rollout

## Runtime Design

### Area Metadata
The neighborhood detail route should load enough district metadata to decide the school resolution tier:
- `source_type`
- `legacy_district_id`
- `geometry`
- `centroid`
- municipality code

### Selection Order
For `named_district` school queries:
1. geometry-backed schools
2. district-scoped ingested schools
3. DeSO fallback schools

For legacy `district` and raw `deso` pages, keep the current logic unchanged in this phase.

### Source Attribution
The API should internally track which source produced schools:
- `geometry_match`
- `geometry_buffer`
- `district_scoped_ingestion`
- `deso_fallback`

This can stay internal for now, but verification output should expose it clearly.

## Ingestion Design

### Municipality-Wide School Pool
School ingestion must always allow explicit municipality scope to override environment defaults.

The ingestion engine should treat Skolverket municipality fetches as the authoritative school pool for a municipality, then derive district-scoped subsets from that pool where needed.

### Geometry-Backed District Verification
For geometry-backed municipalities:
- verify that schools exist inside each district polygon
- flag districts with zero or suspiciously low counts
- optionally use a very small boundary buffer to catch schools located exactly on edges or with minor coordinate noise

This path does not need legacy district ids.

### Centroid-Backed District Population
For centroid-only municipalities:
- keep or extend the existing `named-district-schools` and `seeded-named-districts-schools` ingestion commands
- use municipality-specific school pools plus centroid/radius filtering
- continue writing results under `legacy_district_id`

## Verification Design

### Bulk Verification Command
Add a verification command for named districts that reports, per district:
- district id
- district name
- municipality code
- geometry present or not
- district-scoped school count
- geometry-matched school count
- DeSO fallback school count
- selected resolution tier
- sample school names

### Stockholm First Pass
Run verification for Stockholm municipality `0180` first because it has the strongest official geometry.

Success criteria for the first pass:
- every official Stockholm named district is checked
- zero-school districts are listed explicitly
- districts using fallback instead of geometry are listed explicitly
- obvious wrong-school leakage is visible in the report

### Future Municipalities
The same command should work for any municipality code, not just `0180`.

## Failure Handling
- If Skolverket municipality fetch fails, do not delete previously stored district-scoped school rows.
- If a district geometry query returns zero schools, allow a bounded fallback rather than returning nothing immediately.
- If geometry is invalid or missing, skip to the next tier and log the reason.
- If DeSO fallback is used, mark the district as lower-confidence in verification output.

## Testing

### Automated
- query-builder tests for geometry-backed named-district school selection
- query-builder tests for district-scoped fallback selection
- verification command tests for mixed geometry and seeded municipalities
- municipality-override tests to confirm explicit municipality codes beat env defaults

### Manual
- verify representative Stockholm districts with official geometry
- verify seeded pilot districts such as `Rissne`, `Hallonbergen`, and `Hagalund`
- confirm that a geometry-backed district does not pull obvious neighboring-district schools
- confirm that a seeded district prefers district-scoped schools over DeSO leakage

## Rollout

### Phase 1
- document the quality ladder
- add bulk verification for named-district school coverage
- apply geometry-first runtime selection for geometry-backed `named_districts`
- keep existing seeded-district ingestion for centroid-backed municipalities

### Phase 2
- run and review Stockholm `0180` verification
- fix zero-school or suspicious districts with targeted ingestion/query improvements

### Phase 3
- reuse the same verifier and quality ladder for new municipalities as they gain district geometry or seeded district support

## Recommendation
Treat district-school resolution as a nationwide quality ladder:
- geometry first
- district-scoped ingestion second
- DeSO fallback last

This keeps compatibility with the current pilot implementation, improves Stockholm correctly, and gives future municipalities a predictable upgrade path instead of one-off custom logic.

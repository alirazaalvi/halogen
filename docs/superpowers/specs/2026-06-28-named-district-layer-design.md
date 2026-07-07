# Named District Layer Design

## Goal
Add a real named-district layer on top of the existing DeSO-backed ingestion so the app can support district-level search and district-level browsing using names users actually know, starting with:
- `Stockholm`
- `Sollentuna`
- `Solna`
- `Sundbyberg`

The district layer should become the primary search and display surface for these municipalities, while `deso_areas` remains the canonical statistical layer underneath.

## Problem
The current backend uses official SCB `DeSO` coverage and compatibility `districts` rows shaped as `DESO-<deso_id>`. That is reliable for ingestion and statistics, but it is not a good user-facing search model because users search for named districts such as:
- `Akalla`
- `Kista`
- `Frösunda`
- `Tureberg`
- `Rissne`

SCB DeSO APIs do not return a complete county-wide user-facing district name catalog. The current alias layer improves this for a few important names, but it is still an overlay on top of DeSO compatibility rows rather than a true district model.

## Decision
Implement a new `named_districts` layer with a hybrid source strategy:
- use official municipality district boundary/name datasets where available
- fall back to existing seeded district definitions where official data is missing or delayed

District-level search should query `named_districts` first. The existing `DeSO` model stays canonical for official statistics and geometry-driven coverage.

## Scope
- Add a real `named_districts` table for selected municipalities.
- Add a crosswalk from `named_districts` to `deso_areas`.
- Make district-level search use `named_districts` as the first-class search surface.
- Make district detail pages resolve against `named_districts` and aggregate mapped DeSO data.
- Support hybrid ingestion inputs:
  - official municipal district sources where available
  - existing seeded district definitions as fallback
- Keep existing DeSO ingestion and compatibility rows operational during rollout.

## Out Of Scope
- Full Stockholm-county named-district support in the first pass.
- Removing `deso_areas` as the canonical statistical layer.
- Replacing every existing district-facing API in one step.
- Home-address point search as the primary user flow in this phase.

## Primary Model

### Canonical Statistical Layer
Keep:
- `deso_areas`
- SCB DeSO geometry
- DeSO-scoped demographics, crime, schools, scores, projects, and other ingestion outputs

This layer remains the official small-area source of truth.

### User-Facing District Layer
Add:
- `named_districts`

This layer represents districts users search for and browse in the product. It is not a replacement for DeSO. It is a search-and-presentation layer that maps onto DeSO.

## Data Model

### `named_districts`
Proposed fields:
- `id`
- `municipality_id`
- `source_municipality_code`
- `name`
- `normalized_name`
- `source_type`
- `source_id`
- `geometry`
- `centroid`
- `description`
- `raw_data`
- `created_at`
- `updated_at`

Notes:
- `source_type` distinguishes `official_boundary`, `official_centroid`, `seeded_boundary`, `seeded_centroid`.
- `normalized_name` supports fast district-level search.
- `geometry` is preferred; `centroid` is the fallback when only point-like seeded definitions exist.

### `named_district_deso_map`
Proposed fields:
- `district_id`
- `deso_id`
- `mapping_method`
- `overlap_ratio`
- `priority_weight`
- `raw_data`
- `created_at`
- `updated_at`

Notes:
- `mapping_method` can be `polygon_overlap`, `centroid_contains`, or `nearest_fallback`.
- `overlap_ratio` is preferred when both sides have geometry.
- `priority_weight` lets aggregation logic rank stronger mappings above fallback mappings.

## Source Strategy

### Official Source Path
For each selected municipality, ingestion should first attempt to load official named-district data:
- district names
- stable municipality-specific ids if available
- polygon geometry when available
- source payload into `raw_data`

### Seeded Fallback Path
If no official source is ready for a municipality or if the official source fails:
- use the existing project district seeds for that municipality
- store them in `named_districts` with `source_type` showing they are seeded fallback rows
- keep them searchable so user-facing district search still works

### Municipality Adapters
Implement one adapter per municipality:
- `Stockholm`
- `Sollentuna`
- `Solna`
- `Sundbyberg`

Each adapter should expose a normalized output shape regardless of its upstream source.

## Ingestion Flow
District ingestion for the first rollout should run in this order:

1. ensure municipalities exist
2. ensure DeSO coverage exists
3. ingest named districts for selected municipalities
4. compute or refresh district-to-DeSO crosswalk rows
5. expose district-level search and district detail reads from the new named-district layer

### Crosswalk Generation
Preferred order:
1. polygon overlap when district polygons and DeSO polygons both exist
2. centroid containment when district centroids exist and DeSO polygons exist
3. nearest fallback only when geometry is incomplete

The mapping quality must be stored so low-confidence rows are visible internally.

## Search Design

### Search Priority
When a user searches district names:
1. `named_districts`
2. district aliases tied to `named_districts`
3. existing fallback district compatibility rows only if needed
4. raw DeSO rows last

### Search Output
District search results should return:
- district id
- name
- municipality
- coordinates
- source quality metadata when useful internally

For the user-facing API, the visible name should be the `named_districts.name`.

## Detail And Aggregation

### District Detail Pages
District detail pages should load by `named_districts.id`.

### Data Aggregation
District-level details should aggregate from mapped DeSO rows:
- demographics
- crime
- future projects
- scores
- other DeSO-derived datasets

For point datasets:
- schools
- transport stops
- addresses

The long-term preferred method is direct district geometry membership. In the first rollout, existing distance and DeSO-driven logic can remain where needed, but district detail should prioritize the new crosswalk model when available.

## Compatibility Plan
- Keep current `districts` and `district_aliases` working during rollout.
- Do not remove `DESO-*` compatibility rows yet.
- New district-level search should prefer `named_districts`.
- Existing neighborhood and compare routes can be migrated incrementally to named-district IDs after the search layer is stable.

## Failure Handling
- If one municipality adapter fails, do not fail the entire district ingestion run.
- Keep the previously stored `named_districts` rows for that municipality.
- Log the failure with municipality scope and source type.
- If official geometry is missing, seeded fallback rows remain searchable.
- If crosswalk quality is weak, district pages should still load but may show reduced-confidence aggregation internally.

## Testing

### Automated
- municipality adapter parsing tests
- normalized district search tests
- crosswalk generation tests
- district-level search precedence tests
- district detail aggregation tests for at least one municipality with seeded fallback and one with official-style input

### Manual
Verify searches such as:
- `Akalla`
- `Kista`
- `Tureberg`
- `Frösunda`
- `Rissne`

Confirm each returns named district results before raw DeSO rows.

## Rollout

### Phase 1
- schema for `named_districts` and `named_district_deso_map`
- normalized municipality adapter interface
- adapters for `Stockholm`, `Sollentuna`, `Solna`, `Sundbyberg`
- seeded fallback integration
- district-first search path

### Phase 2
- migrate district detail routes onto `named_districts`
- expand official adapters municipality by municipality
- reduce reliance on manual alias-only behavior

## Risks
- municipalities may expose district data in inconsistent formats
- some municipalities may not have an immediately usable official boundary dataset
- seeded fallback rows may not align cleanly with DeSO geometry
- partial rollout can temporarily produce mixed-quality district coverage across municipalities

## Recommendation
Use a hybrid district-layer architecture:
- `deso_areas` remains canonical for official statistical coverage
- `named_districts` becomes the primary district-level search and browsing model
- municipality adapters load official district sources where possible
- seeded fallback keeps early search coverage alive
- a district-to-DeSO crosswalk powers district-level aggregation without abandoning the official SCB base layer

This gives the project a real district-first product model without losing the stability and coverage of the existing DeSO ingestion.

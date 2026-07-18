[OPEN] Tureberg schools not showing

## Session
- session_id: tureberg-schools
- started_at: 2026-07-06
- scope: Investigate why Tureberg does not show schools in the district-first named-district flow

## Symptoms
- Expected: `Tureberg` shows nearby or related schools in the area detail flow.
- Actual: `Tureberg` is not showing any schools.

## Hypotheses
1. `Tureberg` is missing from `named_districts`.
2. `Tureberg` exists but has no `named_district_deso_map` rows.
3. `Tureberg` uses seeded centroid fallback and the school query path does not handle that path correctly.
4. `Tureberg` maps to DeSO correctly but there are no school rows for the mapped DeSO areas.
5. The UI is selecting an unexpected area id/type for `Tureberg`.

## Evidence Log
- `Kista` currently appears in three backend layers:
- `named_districts`: `ND-0180-kista`
- `districts`: `DESO-0180C6330` with type `deso_compat`
- `deso_areas`: row named `Kista`
- Search dedup currently keys by `id`, so these three survive as separate user-facing results.
- `Tureberg` is not present in `named_districts`.
- `Tureberg` exists in legacy `districts` as `DESO-0163C1150` with alias `Tureberg`.
- SQL proximity search around legacy district `DESO-0163C1150` returns nearby schools, so the base school data is present.
- Manual alias seeds include `Tureberg`, but the current named-district fallback sync for Sollentuna is not producing a `named_district` row for it.

## Status
- Debugging started. No business logic changes made.

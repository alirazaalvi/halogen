[OPEN] Akalla missing demographics and schools

## Session
- session_id: akalla-data
- started_at: 2026-07-06
- scope: Investigate why Akalla is missing demographics and schools in the named-district detail flow

## Symptoms
- Expected: `Akalla` shows demographics and schools in the area detail flow.
- Actual: `Akalla` does not show demographics data and schools data.

## Hypotheses
1. `Akalla` exists in `named_districts`, but `named_district_deso_map` is empty or incomplete.
2. `Akalla` has crosswalk rows, but the mapped DeSO areas do not have `demographics` rows.
3. `Akalla` has crosswalk and demographics data, but the named-district aggregation query is not returning it correctly.
4. `Akalla` has nearby school rows in the DB, but the named-district school query filters them out.
5. The UI is resolving a different area id than `ND-0180-akalla`.

## Evidence Log
- Live request to `/api/neighborhood/ND-0180-akalla` returned `500` with PostgreSQL error `42702` and message `column reference "name" is ambiguous`.
- `named_districts` contains `ND-0180-akalla` with official boundary geometry and centroid.
- `named_district_deso_map` contains `13` rows for `ND-0180-akalla`.
- `demographics` joined through `named_district_deso_map` contains `13` rows for `ND-0180-akalla`.
- `neighborhood_scores` joined through `named_district_deso_map` contains `13` rows for `ND-0180-akalla`.
- Direct school proximity SQL around `ND-0180-akalla` returns nearby schools including `Akalla grundskola F-9`, `Oxhagsskolan`, and `Fryshuset Grundskola Akalla`.
- Root cause identified in `backend/src/modules/neighborhoods/neighborhood.routes.ts`: the school proximity query for district-style detail pages selected bare `name` and other school columns while joined to `named_districts` or `districts`, making `name` ambiguous.
- Minimal fix applied: qualified school columns as `s.name`, `s.address`, `s.student_count`, `s.performance`, `s.coordinates`, and `s.source_links` in both named-district and district school query branches.
- Backend verification after fix: `bun run check` passes.
- Browser evidence from user: frontend requests `http://localhost:3001/api/neighborhood-score?id=ND-0180-akalla`.
- Reproduced locally: `/api/neighborhood-score?id=ND-0180-akalla` returned `404` because the route only supported legacy `districtScores` and raw `neighborhoodScores`, not `named_districts`.
- Minimal fix applied: added named-district support to `/api/neighborhood-score` via `getAreaDetails()` + `getScores()`.
- Follow-up issue identified: named-district score aggregation returned camelCase-mismatched fields, so the endpoint responded with only `{ "type": "district" }`.
- Minimal fix applied: changed named-district aggregated SQL aliases to quoted camelCase names (`"overallScore"`, `"schoolsScore"`, etc.) to match the existing response shaping code.
- Verification after fix: `curl http://localhost:3001/api/neighborhood-score?id=ND-0180-akalla` now returns real score data including `schools`, `transport`, `housing`, `green`, and `growth`.
- Runtime evidence from `akalla-data` debug session showed repeated `Akalla` requests reached the detail route before the schools query, confirming the full detail path was still the active blocker.
- Direct query timing showed the original named-district schools lookup was expensive but finite, and the remaining subqueries (`transport`, `addresses`, `demographics`, `crime`, `future projects`) were all relatively fast in isolation.
- Minimal fix applied: changed named-district schools lookup from a broad spatial scan to a DeSO-backed join via `named_district_deso_map` and `schools.deso_id`.
- Fresh backend verification on port `3002`: `GET /api/neighborhood/ND-0180-akalla` completed in about `7.09s` with `8` schools and demographics present. First school returned: `Oxhagsskolan`.
- Fresh backend server log on port `3002`: request completed with `200` in about `7076ms`.

## Status
- Fix applied in code; existing `3001` process likely needs restart or reload to pick up the latest backend changes before final UI verification.

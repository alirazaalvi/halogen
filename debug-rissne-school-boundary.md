# Debug Session: rissne-school-boundary

- Status: OPEN
- Started: 2026-07-07
- Scope:
  - `Rissne` shows schools outside `Rissne`
  - `Rissne` does not show the expected in-area schools
- Notes:
  - Investigation follows instrumentation-first workflow.
  - No new business-logic changes are allowed until runtime evidence is collected.
  - Runtime evidence confirmed the API was selecting `nearby_real_schools` for `Rissne`, returning schools like `Marcusskolan`, `Knutbyskolan`, and `Bromstensskolan` based on centroid proximity.
  - Database probe confirmed there is only one explicit `Rissne`-linked school row: `Rissne School`, and it has no coordinates.
  - Crosswalk probe confirmed `ND-0183-rissne` maps to a single DeSO row `0183C1220`, which produced the same off-target school candidates as the nearby proximity branch.
  - Minimal safe fix applied: when a seeded district has explicit district-linked matches, keep those matches and do not substitute nearby or DeSO-based schools.
  - Post-fix verification on fresh backend port `3008`: `Rissne` returns only `Rissne School`, removing off-target schools outside the district.

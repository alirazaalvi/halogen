# School Normalization And Anomaly Repair Design

## Goal
Improve school data consistency so `bun run ingest` repairs bad school names and addresses in place, keeps the UI friendly, and preserves enough raw context for debugging and analysis.

## Problem
Some ingested school rows have inconsistent names or duplicated addresses across unrelated districts. Examples include truncated names like `Distra IRS` and the same address being reused for multiple schools in different districts. The current pipeline stores raw school payloads, but the flattened `schools` columns can still contain values that are not trustworthy enough for UI display or downstream analysis.

## Scope
- Normalize school names, addresses, and coordinates during ingestion.
- Use raw Skolverket school detail payloads as the canonical source when available.
- Detect and flag suspicious school rows without dropping them.
- Make `bun run ingest` act as the repair pass for previously bad rows.
- Keep the frontend simple by serving cleaned values from the existing `schools` columns.

## Out Of Scope
- New frontend data-cleanup logic.
- Deleting school rows automatically.
- Building a user-facing anomaly dashboard.

## Canonical Data Model
The `schools` table remains the UI-friendly source of truth for:
- `name`
- `address`
- `coordinates`
- `student_count`
- `performance`

The `raw_data` column remains the audit trail and should include:
- upstream list payload
- upstream detail payload
- selected canonical fields
- normalization metadata
- anomaly flags

Recommended normalized shape:

```json
{
  "list_payload": {},
  "detail_payload": {},
  "list_item": {},
  "detail_attributes": {},
  "normalized": {
    "status": "canonical",
    "canonical_name": "Distra Gymnasium IRS",
    "canonical_name_source": "detail_attributes.displayName",
    "canonical_address": "Åsögatan 97, 118 29 Stockholm",
    "canonical_address_source": "detail_attributes.addresses.BESOKSADRESS",
    "coordinate_source": "detail_attributes.geoCoordinates",
    "normalized_at": "2026-06-19T12:00:00.000Z",
    "warnings": []
  }
}
```

## Canonical Selection Rules
### Name
Select the canonical school name using this order:
1. `detail_attributes.displayName`
2. a cleaned detail-level school-unit name if present
3. list payload name fields like `item.name` or `item.schoolName`
4. existing database value only as a last fallback

Name cleanup should:
- trim whitespace
- collapse repeated spaces
- remove obvious placeholder fragments
- avoid storing short low-information uppercase tokens when a richer detail name exists

### Address
Select the canonical address using this order:
1. the `BESOKSADRESS` entry in `detail_attributes.addresses`
2. any other detail address entry
3. geocoded fallback generated from raw address parts
4. existing database value only as a last fallback

Address cleanup should:
- assemble `streetAddress`, `postalCode`, and `locality` into a consistent display string
- preserve postal code and locality when present
- avoid replacing a richer detail address with a weaker fallback string

### Coordinates
Select coordinates using this order:
1. explicit coordinates from detail payload
2. geocoded coordinates from the chosen canonical address
3. existing database coordinates as fallback

## Anomaly Rules
Anomalies are additive warnings stored in `raw_data.normalized.warnings`.

### Duplicate Address
Flag when the same canonical address appears across multiple school names in different districts or otherwise suspicious contexts.

### Truncated Or Low-Quality Name
Flag when the stored name:
- is very short
- looks abbreviated without matching the richer detail name
- resembles a placeholder
- loses meaningful detail compared with the canonical detail name

### Cross-District Mismatch
Flag when district or municipality context inferred from ingestion conflicts with detail payload context.

### Address Quality
Flag when:
- street name is missing
- postal code or locality is missing
- chosen address is clearly weaker than another raw detail address
- a repeated fallback string is being used where richer detail data exists

### Coordinate Mismatch
Flag when explicit detail coordinates and geocoded coordinates differ beyond a configured tolerance, starting with `500m`.

## Ingestion Flow Changes
### Fetch Phase
Update `fetchSkolverketSchools()` so each returned `SchoolRecord` already contains:
- canonical `name`
- canonical `address`
- selected `lat` and `lng`
- `raw_data.normalized`

### Upsert Phase
Update school upserts so canonical values always win for flattened columns while the full upstream payload remains in `raw_data`.

If normalization is uncertain:
- keep the best available flattened values
- set `raw_data.normalized.status = "fallback"`
- record reasons in `warnings`

### Matching Strategy
Keep current record matching behavior, but generate the canonical name before insert or update so poor variants do not keep multiplying.

## Repair Strategy
`bun run ingest` becomes the repair mechanism.

On rerun it should:
- re-fetch school detail payloads
- recompute canonical fields
- overwrite stale or inconsistent school flattened columns
- refresh `raw_data.normalized`
- preserve anomaly warnings for later inspection

This ensures previously bad rows can be corrected in place without custom one-off scripts for every issue.

## API And UI Behavior
The API should continue reading school display data from the flattened `schools` columns:
- `name`
- `address`
- `coordinates`
- `student_count`
- `performance`

The UI should not contain ad hoc cleanup rules for school names or addresses. Once ingestion is repaired, the frontend gets better values automatically.

## Error Handling
- Never silently discard a school row.
- Never delete a row only because it looks suspicious.
- Prefer keeping a usable flattened row plus anomaly metadata over dropping data.
- If normalization fails, preserve the best available values and mark the row as fallback-normalized.

## Verification
Verification should include targeted checks for:
- same address reused by different school names across districts
- suspiciously short or truncated names
- rows where canonical detail name differs from stored database name
- rows where detail address exists but stored address is weaker or duplicated
- rows where geocoded coordinates differ materially from explicit detail coordinates

Suggested validation flow:
1. run `bun run ingest`
2. query sample previously bad rows
3. compare stored `name`, `address`, and `raw_data.normalized`
4. confirm API responses now show corrected values without route-level cleanup

## Recommended Implementation Steps
1. Add normalization helpers for school names, addresses, and coordinates in ingestion.
2. Update `fetchSkolverketSchools()` to build canonical school records and anomaly warnings.
3. Update school upsert logic to persist normalized values and normalization metadata.
4. Add targeted anomaly queries or checks for post-ingestion verification.
5. Run `bun run ingest` and validate repaired rows.

## Risks
- Over-aggressive normalization could collapse legitimately distinct schools sharing a campus address.
- Municipality-level school feeds may still include schools not relevant to a district, so district assignment should remain conservative.
- Geocoded fallbacks can look consistent while still being wrong, so explicit detail coordinates should win whenever available.

## Recommendation
Implement ingestion-side normalization plus anomaly auditing. This keeps the database trustworthy, makes the UI simpler, and gives enough structured metadata in `raw_data` to debug future school inconsistencies.

import { describe, expect, test } from "bun:test";
import {
  buildNamedDistrictSchoolResolutionQuery,
  selectNamedDistrictSchoolResolutionTier,
} from "./named-district-school-resolution";

describe("named district school resolution", () => {
  test("builds a query that includes geometry, district-scoped, and deso fallback tiers", () => {
    const query = buildNamedDistrictSchoolResolutionQuery({
      districtId: "ND-0180-akalla",
      legacyDistrictId: "D-123",
      geometryBufferMeters: 180,
      districtRadiusMeters: 4200,
      limit: 8,
    });

    expect(query.text).toContain("geometry_match_schools");
    expect(query.text).toContain("geometry_buffer_schools");
    expect(query.text).toContain("ST_Expand(dc.geometry, $2)");
    expect(query.text).toContain("ST_DWithin(sp.coordinates, dc.geometry, $2)");
    expect(query.text).toContain("district_geo_schools");
    expect(query.text).toContain("district_placeholders");
    expect(query.text).toContain("deso_fallback_schools");
    expect(query.text).toContain("deduped_schools");
    expect(query.values).toEqual(["ND-0180-akalla", 180 / 111_320, "D-123", 4200, 8]);
  });

  test("keeps the district-scoped slot nullable when no legacy district exists", () => {
    const query = buildNamedDistrictSchoolResolutionQuery({
      districtId: "ND-0180-akalla",
      legacyDistrictId: null,
      geometryBufferMeters: 150,
      districtRadiusMeters: 4000,
      limit: 8,
    });

    expect(query.values).toEqual(["ND-0180-akalla", 150 / 111_320, null, 4000, 8]);
  });

  test("prefers geometry matches over all weaker tiers", () => {
    expect(
      selectNamedDistrictSchoolResolutionTier({
        geometryMatchCount: 3,
        geometryBufferCount: 1,
        districtScopedCount: 4,
        districtPlaceholderCount: 0,
        desoFallbackCount: 7,
      }),
    ).toBe("geometry_match");
  });

  test("treats placeholder-only district rows as district-scoped coverage", () => {
    expect(
      selectNamedDistrictSchoolResolutionTier({
        geometryMatchCount: 0,
        geometryBufferCount: 0,
        districtScopedCount: 0,
        districtPlaceholderCount: 2,
        desoFallbackCount: 5,
      }),
    ).toBe("district_scoped_ingestion");
  });

  test("falls back to deso only when stronger tiers are empty", () => {
    expect(
      selectNamedDistrictSchoolResolutionTier({
        geometryMatchCount: 0,
        geometryBufferCount: 0,
        districtScopedCount: 0,
        districtPlaceholderCount: 0,
        desoFallbackCount: 4,
      }),
    ).toBe("deso_fallback");
  });
});

import { describe, expect, test } from "bun:test";
import { normalizeDistrictAlias } from "./district-aliases";
import { STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS } from "./ingestion/stockholm-district-aliases";

describe("district alias helpers", () => {
  test("normalizes Swedish neighborhood names for search", () => {
    expect(normalizeDistrictAlias("Frösunda")).toBe("frosunda");
    expect(normalizeDistrictAlias("Centrala   Sollentuna")).toBe("centrala sollentuna");
    expect(normalizeDistrictAlias("Hägerstensåsen")).toBe("hagerstensasen");
  });

  test("includes manual search seeds for common Stockholm neighborhood searches", () => {
    const displayNames = new Set(
      STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS.map((seed) => seed.display_name),
    );

    expect(displayNames.has("Akalla")).toBe(true);
    expect(displayNames.has("Tureberg")).toBe(true);
    expect(displayNames.has("Frösunda")).toBe(true);
  });
});

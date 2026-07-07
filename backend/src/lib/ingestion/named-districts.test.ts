import { describe, expect, test } from "bun:test";
import { buildNamedDistrictId, NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES } from "./named-districts";

describe("named district helpers", () => {
  test("builds stable ids from municipality code and district name", () => {
    expect(buildNamedDistrictId("0184", "Frösunda")).toBe("ND-0184-frosunda");
    expect(buildNamedDistrictId("0163", "Centrala Sollentuna")).toBe("ND-0163-centrala-sollentuna");
  });

  test("keeps the pilot municipality scope explicit", () => {
    expect(NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES).toEqual(["0180", "0163", "0184", "0183"]);
  });
});

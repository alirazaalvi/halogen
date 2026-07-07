import test from "node:test";
import assert from "node:assert/strict";
import { ensurePxwebUrl, parsePxwebRegionVariable } from "./pxweb.js";

test("ensurePxwebUrl normalizes relative PxWeb paths", () => {
  assert.equal(
    ensurePxwebUrl("BE/BE0101/BE0101Y"),
    "https://api.scb.se/OV0104/v1/doris/en/ssd/START/BE/BE0101/BE0101Y",
  );
});

test("parsePxwebRegionVariable classifies county, municipality, and DeSO codes", () => {
  const items = parsePxwebRegionVariable({
    code: "Region",
    values: ["01", "0114", "0114A0010_DeSO2025", "0114A0010"],
    valueTexts: ["01 Stockholm county", "0114 Upplands Väsby", "0114A0010", "0114A0010"],
  });

  assert.deepEqual(
    items.map((item) => ({
      level: item.level,
      code: item.code,
      county_code: item.county_code,
      municipality_code: item.municipality_code,
      version: item.version,
    })),
    [
      {
        level: "county",
        code: "01",
        county_code: "01",
        municipality_code: null,
        version: "other",
      },
      {
        level: "municipality",
        code: "0114",
        county_code: "01",
        municipality_code: "0114",
        version: "other",
      },
      {
        level: "deso",
        code: "0114A0010",
        county_code: "01",
        municipality_code: "0114",
        version: "2025",
      },
      {
        level: "deso",
        code: "0114A0010",
        county_code: "01",
        municipality_code: "0114",
        version: "legacy",
      },
    ],
  );
});

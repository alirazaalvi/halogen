import { describe, expect, test } from "bun:test";
import {
  buildCompatibilityDistrictId,
  buildCompatibilityDistrictName,
  extractStockholmCountyDesoGeometries,
  normalizeStockholmCountyDesoItems,
} from "./stockholm-deso";

describe("stockholm-deso helpers", () => {
  test("builds stable compatibility district ids and names", () => {
    expect(buildCompatibilityDistrictId("0114A0010")).toBe("DESO-0114A0010");
    expect(buildCompatibilityDistrictName("0114A0010")).toBe("DeSO 0114A0010");
  });

  test("normalizes Stockholm county DeSO list items", () => {
    const seeds = normalizeStockholmCountyDesoItems(
      [
        {
          level: "county",
          source_code: "01",
          code: "01",
          label: "01 Stockholm county",
          county_code: "01",
          municipality_code: null,
          version: "other",
        },
        {
          level: "deso",
          source_code: "0114A0010_DeSO2025",
          code: "0114A0010",
          label: "0114A0010",
          county_code: "01",
          municipality_code: "0114",
          version: "2025",
        },
        {
          level: "deso",
          source_code: "0114A0010",
          code: "0114A0010",
          label: "0114A0010",
          county_code: "01",
          municipality_code: "0114",
          version: "legacy",
        },
        {
          level: "deso",
          source_code: "1280C1070_DeSO2025",
          code: "1280C1070",
          label: "1280C1070",
          county_code: "12",
          municipality_code: "1280",
          version: "2025",
        },
      ],
      new Map([["0114", "Upplands Vasby"]]),
    );

    expect(seeds).toEqual([
      {
        deso_id: "0114A0010",
        area_name: "DeSO 0114A0010",
        district_id: "DESO-0114A0010",
        district_name: "DeSO 0114A0010",
        municipality_code: "0114",
        municipality_name: "Upplands Vasby",
        county_code: "01",
        source_code: "0114A0010_DeSO2025",
        version: "2025",
      },
    ]);
  });

  test("extracts Stockholm county DeSO geometries from SCB geodata payloads", () => {
    const records = extractStockholmCountyDesoGeometries({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            desokod: "0114A0010",
            kommunkod: "0114",
            lanskod: "01",
            regsokod: "0114R001",
            version: "2025_v2",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [18.0, 59.0],
                [18.1, 59.0],
                [18.1, 59.1],
                [18.0, 59.1],
                [18.0, 59.0],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: {
            desokod: "1280C1070",
            kommunkod: "1280",
            lanskod: "12",
          },
          geometry: {
            type: "Polygon",
            coordinates: [],
          },
        },
      ],
    });

    expect(records).toEqual([
      {
        deso_id: "0114A0010",
        municipality_code: "0114",
        county_code: "01",
        regso_code: "0114R001",
        version: "2025_v2",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [18.0, 59.0],
              [18.1, 59.0],
              [18.1, 59.1],
              [18.0, 59.1],
              [18.0, 59.0],
            ],
          ],
        },
        raw_feature: {
          type: "Feature",
          properties: {
            desokod: "0114A0010",
            kommunkod: "0114",
            lanskod: "01",
            regsokod: "0114R001",
            version: "2025_v2",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [18.0, 59.0],
                [18.1, 59.0],
                [18.1, 59.1],
                [18.0, 59.1],
                [18.0, 59.0],
              ],
            ],
          },
        },
      },
    ]);
  });
});

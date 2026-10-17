import { describe, expect, test } from "bun:test";
import {
  fetchDesoPopulation,
  growthPercent,
  parseJsonStat2ByRegionAndPeriod,
  pickLatestPeriods,
} from "./scb-population";

const metadata = {
  variables: [
    { code: "Region", values: ["0114C1010", "0114C1020", "0180C1010"] },
    { code: "Alder", values: ["tot"], elimination: true },
    { code: "ContentsCode", values: ["BE0101A9"] },
    { code: "Tid", values: ["2023", "2024", "2025"] },
  ],
};

// 2 regions x 1 content x 2 periods, row-major (Region, ContentsCode, Tid)
const stat = {
  id: ["Region", "ContentsCode", "Tid"],
  size: [2, 1, 2],
  dimension: {
    Region: { category: { index: { "0114C1010": 0, "0180C1010": 1 } } },
    ContentsCode: { category: { index: { BE0101A9: 0 } } },
    Tid: { category: { index: ["2024", "2025"] } },
  },
  value: [1000, 1100, null, 500],
};

describe("scb population", () => {
  test("pickLatestPeriods ignores non-year periods and sorts numerically", () => {
    expect(pickLatestPeriods(["2025", "2023", "2024M01", "2024"])).toEqual(["2024", "2025"]);
    expect(pickLatestPeriods([])).toEqual([]);
  });

  test("growthPercent is null when data is missing", () => {
    expect(growthPercent(1100, 1000)).toBe(10);
    expect(growthPercent(null, 1000)).toBeNull();
    expect(growthPercent(1000, 0)).toBeNull();
  });

  test("parses region/period values and keeps nulls as null", () => {
    const parsed = parseJsonStat2ByRegionAndPeriod(stat);
    expect(parsed.get("0114C1010")?.get("2025")).toBe(1100);
    expect(parsed.get("0180C1010")?.get("2024")).toBeNull();
    expect(parsed.get("0180C1010")?.get("2025")).toBe(500);
  });

  test("rejects an unexpected payload", () => {
    expect(() => parseJsonStat2ByRegionAndPeriod({ foo: 1 })).toThrow();
  });

  test("fetches the latest published period from metadata, not the calendar", async () => {
    const calls: Array<{ method?: string; body?: string }> = [];
    const result = await fetchDesoPopulation(
      async (_url, init) => {
        calls.push({ method: init.method, body: init.body as string | undefined });
        return init.method === "POST" ? stat : metadata;
      },
      ["0114C1010", "0180C1010", "9999X0000"],
      { delayMs: 0 },
    );
    expect(result.year).toBe(2025);
    expect(result.previousYear).toBe(2024);
    expect(result.byDeso.get("0114C1010")).toEqual({ population: 1100, previous: 1000 });
    expect(result.byDeso.has("9999X0000")).toBe(false);
    const query = JSON.parse(calls[1].body ?? "{}");
    expect(query.query[2].selection.values).toEqual(["2024", "2025"]);
    expect(query.query.map((q: { code: string }) => q.code)).not.toContain("Alder");
  });
});

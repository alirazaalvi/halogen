import { describe, expect, test } from "bun:test";
import {
  fetchIndicator,
  type PxIndicatorSpec,
  parseJsonStat2Sums,
  validateSpec,
} from "./pxweb-indicator";

const metadata = {
  variables: [
    { code: "Region", values: ["R1", "R2", "R3"] },
    { code: "Fodelse", values: ["sv", "ut", "tot"] },
    { code: "Kon", values: ["1", "2"], elimination: true },
    { code: "ContentsCode", values: ["C1"] },
    { code: "Tid", values: ["2023", "2024"] },
  ],
};

const spec: PxIndicatorSpec = {
  id: "foreign_born_pct",
  tableUrl: "https://example.test/table",
  column: "foreign_born_pct",
  numerator: { Fodelse: ["ut"], ContentsCode: ["C1"] },
  denominator: { Fodelse: ["tot"], ContentsCode: ["C1"] },
};

describe("validateSpec", () => {
  test("accepts a spec whose codes exist", () => {
    expect(() => validateSpec(spec, metadata)).not.toThrow();
  });
  test("rejects unknown variables and values without guessing", () => {
    expect(() => validateSpec({ ...spec, numerator: { Nope: ["x"] } }, metadata)).toThrow(
      /unknown variable/,
    );
    expect(() =>
      validateSpec({ ...spec, numerator: { ...spec.numerator, Fodelse: ["zz"] } }, metadata),
    ).toThrow(/not in the table/);
  });
  test("rejects a spec that leaves a required variable unselected", () => {
    expect(() =>
      validateSpec(
        { ...spec, numerator: { Fodelse: ["ut"] }, denominator: { Fodelse: ["tot"] } },
        metadata,
      ),
    ).toThrow(/ContentsCode is required/);
  });
});

describe("parseJsonStat2Sums", () => {
  const stat = (values: Array<number | null>) => ({
    id: ["Region", "Fodelse", "Tid"],
    size: [2, 2, 1],
    dimension: {
      Region: { category: { index: { R1: 0, R2: 1 } } },
      Fodelse: { category: { index: { sv: 0, ut: 1 } } },
      Tid: { category: { index: { "2024": 0 } } },
    },
    value: values,
  });
  test("sums over the other dimensions", () => {
    const parsed = parseJsonStat2Sums(stat([10, 5, 20, 30]));
    expect(parsed.get("R1")?.get("2024")).toBe(15);
    expect(parsed.get("R2")?.get("2024")).toBe(50);
  });
  test("a missing cell makes the sum null, never a partial total", () => {
    expect(
      parseJsonStat2Sums(stat([10, null, 20, 30]))
        .get("R1")
        ?.get("2024"),
    ).toBeNull();
  });
});

describe("fetchIndicator", () => {
  test("computes a share from numerator and denominator at the latest period", async () => {
    const bodies: string[] = [];
    const payloadFor = (values: number[]) => ({
      id: ["Region", "Fodelse", "ContentsCode", "Tid"],
      size: [2, 1, 1, 1],
      dimension: {
        Region: { category: { index: { R1: 0, R2: 1 } } },
        Fodelse: { category: { index: { x: 0 } } },
        ContentsCode: { category: { index: { C1: 0 } } },
        Tid: { category: { index: { "2024": 0 } } },
      },
      value: values,
    });
    const result = await fetchIndicator(
      async (_url, init) => {
        if (init.method === "GET") return metadata;
        bodies.push(String(init.body));
        return bodies.length === 1 ? payloadFor([25, 0]) : payloadFor([100, 0]);
      },
      spec,
      ["R1", "R2", "OTHER"],
      { delayMs: 0 },
    );
    expect(result.get("R1")).toEqual({ value: 25, year: 2024 });
    expect(result.has("R2")).toBe(false); // denominator 0 -> no value, not a division result
    expect(result.has("OTHER")).toBe(false);
    expect(JSON.parse(bodies[0]).query.at(-1).selection.values).toEqual(["2024"]);
  });

  test("fails before querying when the spec does not match the table", async () => {
    let posts = 0;
    await expect(
      fetchIndicator(
        async (_u, init) => {
          if (init.method === "POST") posts += 1;
          return metadata;
        },
        { ...spec, numerator: { Fodelse: ["bogus"], ContentsCode: ["C1"] } },
        ["R1"],
        { delayMs: 0 },
      ),
    ).rejects.toThrow();
    expect(posts).toBe(0);
  });
});

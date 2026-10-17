import { describe, expect, test } from "bun:test";
import { COMPONENT_KEYS, computeScores, MIN_COVERAGE, WEIGHTS } from "./score";

const full = {
  year: 2025,
  demographics: {
    medianIncome: 450000,
    higherEduPct: 50,
    familiesWithKidsPct: 30,
    populationGrowth: 1,
  },
  schools: { avgPerformance: 70, schoolCount: 3 },
  transport: { stopCount: 2, avgRoutes: 4 },
  housing: { avgBuildingYear: 2000, addressCount: 5 },
  safety: { incidentCount: 200, trend: "stable" },
  greenAreas: { greenSpaceRatio: 30 },
  environment: { floodRisk: 10, airQuality: 20, temperatureAvg: 9 },
  futureGrowth: { projectCount: 2, avgConfidence: 70, populationGrowth: 1 },
};

describe("computeScores", () => {
  test("weights sum to 1", () => {
    const sum = COMPONENT_KEYS.reduce((s, k) => s + WEIGHTS[k], 0);
    expect(Math.round(sum * 1000) / 1000).toBe(1);
  });

  test("full inputs give full coverage and an overall score", () => {
    const r = computeScores(full);
    expect(r.coverage).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.overall).not.toBeNull();
  });

  test("no inputs give no scores, never defaults", () => {
    const r = computeScores({ year: 2025 });
    expect(r.overall).toBeNull();
    expect(r.coverage).toBe(0);
    expect(r.available).toEqual([]);
    for (const key of COMPONENT_KEYS) expect(r.components[key]).toBeNull();
  });

  test("a single missing input nulls its component only", () => {
    const r = computeScores({
      ...full,
      demographics: { ...full.demographics, medianIncome: null },
    });
    expect(r.components.demographics).toBeNull();
    expect(r.missing).toEqual(["demographics"]);
    expect(r.components.schools).not.toBeNull();
  });

  test("overall re-normalises over available components", () => {
    const r = computeScores({
      year: 2025,
      schools: { avgPerformance: 80, schoolCount: 0 },
      greenAreas: { greenSpaceRatio: 30 },
      safety: { incidentCount: 0, trend: null },
      transport: { stopCount: 1, avgRoutes: 1 },
    });
    // schoolCount 0 => schools unknown; remaining weight 0.12 + 0.14 + 0.14 = 0.40 < MIN_COVERAGE
    expect(r.coverage).toBeLessThan(MIN_COVERAGE);
    expect(r.overall).toBeNull();
  });

  test("overall equals the weighted mean of available components", () => {
    const r = computeScores({
      year: 2025,
      demographics: full.demographics,
      schools: full.schools,
      safety: full.safety,
      transport: full.transport,
    });
    const parts = (["demographics", "schools", "safety", "transport"] as const).map(
      (k) => [r.components[k] as number, WEIGHTS[k]] as const,
    );
    const w = parts.reduce((s, [, x]) => s + x, 0);
    const expected = parts.reduce((s, [v, x]) => s + v * x, 0) / w;
    expect(r.overall).toBeCloseTo(expected, 1);
    expect(r.coverage).toBeCloseTo(w, 3);
  });

  test("zero stops or zero schools are treated as unknown", () => {
    const r = computeScores({
      ...full,
      transport: { stopCount: 0, avgRoutes: 0 },
      schools: { avgPerformance: null, schoolCount: 4 },
    });
    expect(r.components.transport).toBeNull();
    expect(r.components.schools).toBeNull();
  });

  test("non-finite numbers are treated as missing", () => {
    const r = computeScores({ ...full, greenAreas: { greenSpaceRatio: Number.NaN } });
    expect(r.components.greenAreas).toBeNull();
  });

  test("scores are clamped to 0..100", () => {
    const r = computeScores({ year: 2025, safety: { incidentCount: 100000, trend: "up" } });
    expect(r.components.safety).toBe(0);
  });
});

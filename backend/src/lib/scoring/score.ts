/**
 * Pure scoring logic. No I/O, no defaults for missing data.
 *
 * Rules (see docs/specs/2026-10-17-data-reliability-spec.md, DR-10..DR-12):
 * - a component score is `null` when any input it needs is missing;
 * - the overall score only uses available components, with weights re-normalised;
 * - the overall score is withheld when weighted coverage is below MIN_COVERAGE.
 */

export const SCORING_VERSION = "2.0.0";
export const MIN_COVERAGE = 0.5;

export const COMPONENT_KEYS = [
  "demographics",
  "housing",
  "transport",
  "schools",
  "safety",
  "greenAreas",
  "environment",
  "futureGrowth",
] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const WEIGHTS: Record<ComponentKey, number> = {
  demographics: 0.14,
  housing: 0.14,
  transport: 0.14,
  schools: 0.18,
  safety: 0.14,
  greenAreas: 0.12,
  environment: 0.06,
  futureGrowth: 0.08,
};

type Num = number | null | undefined;

export interface ScoringInputs {
  year: number;
  demographics?: {
    medianIncome: Num;
    higherEduPct: Num;
    familiesWithKidsPct: Num;
    populationGrowth: Num;
  };
  schools?: { avgPerformance: Num; schoolCount: Num };
  transport?: { stopCount: Num; avgRoutes: Num };
  /** Housing *stock* indicator (building age, address count). It is not market data. */
  housing?: { avgBuildingYear: Num; addressCount: Num };
  safety?: { incidentCount: Num; trend: string | null | undefined };
  greenAreas?: { greenSpaceRatio: Num };
  environment?: { floodRisk: Num; airQuality: Num; temperatureAvg: Num };
  futureGrowth?: { projectCount: Num; avgConfidence: Num; populationGrowth: Num };
}

export interface ScoreResult {
  components: Record<ComponentKey, number | null>;
  overall: number | null;
  /** Sum of weights of the available components, 0..1. */
  coverage: number;
  available: ComponentKey[];
  missing: ComponentKey[];
  version: string;
}

function isNum(value: Num): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function allNum(...values: Num[]): boolean {
  return values.every(isNum);
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function roundScore(value: number): number {
  return Math.round(clampScore(value) * 100) / 100;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function demographicsScore(i: ScoringInputs["demographics"]): number | null {
  if (!i || !allNum(i.medianIncome, i.higherEduPct, i.familiesWithKidsPct)) return null;
  return roundScore(
    ((i.medianIncome as number) / 600000) * 40 +
      (i.higherEduPct as number) * 0.35 +
      (i.familiesWithKidsPct as number) * 0.25,
  );
}

function schoolsScore(i: ScoringInputs["schools"]): number | null {
  if (!i || !allNum(i.avgPerformance, i.schoolCount) || (i.schoolCount as number) <= 0) return null;
  return roundScore((i.avgPerformance as number) + Math.min((i.schoolCount as number) * 2, 10));
}

function transportScore(i: ScoringInputs["transport"]): number | null {
  // A stop count of 0 cannot be told apart from "not ingested", so it is treated as unknown.
  if (!i || !allNum(i.stopCount, i.avgRoutes) || (i.stopCount as number) <= 0) return null;
  return roundScore((i.avgRoutes as number) * 14 + Math.min((i.stopCount as number) * 8, 30));
}

function housingScore(i: ScoringInputs["housing"], year: number): number | null {
  if (!i || !allNum(i.avgBuildingYear, i.addressCount) || (i.addressCount as number) <= 0) {
    return null;
  }
  const agePenalty = Math.max(0, year - (i.avgBuildingYear as number)) * 1.1;
  return roundScore(92 - agePenalty + Math.min((i.addressCount as number) * 2, 20));
}

function safetyScore(i: ScoringInputs["safety"]): number | null {
  if (!i || !isNum(i.incidentCount)) return null;
  const trend = String(i.trend ?? "").toLowerCase();
  const adjustment = trend === "down" ? 8 : trend === "up" ? -8 : 0;
  return roundScore(100 - i.incidentCount / 8 + adjustment);
}

function greenScore(i: ScoringInputs["greenAreas"]): number | null {
  if (!i || !isNum(i.greenSpaceRatio)) return null;
  return roundScore(i.greenSpaceRatio * 2.6);
}

function environmentScore(i: ScoringInputs["environment"]): number | null {
  if (!i || !allNum(i.floodRisk, i.airQuality, i.temperatureAvg)) return null;
  return roundScore(
    100 -
      (i.floodRisk as number) * 1.2 -
      (i.airQuality as number) * 0.9 +
      Math.max(0, 18 - Math.abs((i.temperatureAvg as number) - 10)) * 2,
  );
}

function futureGrowthScore(i: ScoringInputs["futureGrowth"]): number | null {
  if (!i || !allNum(i.projectCount, i.avgConfidence, i.populationGrowth)) return null;
  return roundScore(
    Math.min((i.projectCount as number) * 12, 55) +
      (i.avgConfidence as number) * 0.35 +
      (i.populationGrowth as number) * 4,
  );
}

export function computeScores(inputs: ScoringInputs): ScoreResult {
  const components: Record<ComponentKey, number | null> = {
    demographics: demographicsScore(inputs.demographics),
    housing: housingScore(inputs.housing, inputs.year),
    transport: transportScore(inputs.transport),
    schools: schoolsScore(inputs.schools),
    safety: safetyScore(inputs.safety),
    greenAreas: greenScore(inputs.greenAreas),
    environment: environmentScore(inputs.environment),
    futureGrowth: futureGrowthScore(inputs.futureGrowth),
  };

  const available = COMPONENT_KEYS.filter((key) => components[key] !== null);
  const missing = COMPONENT_KEYS.filter((key) => components[key] === null);
  const weightSum = available.reduce((sum, key) => sum + WEIGHTS[key], 0);
  const coverage = Math.round(weightSum * 1000) / 1000;

  let overall: number | null = null;
  if (available.length > 0 && coverage >= MIN_COVERAGE) {
    const weighted = available.reduce(
      (sum, key) => sum + (components[key] as number) * WEIGHTS[key],
      0,
    );
    overall = roundScore(weighted / weightSum);
  }

  return { components, overall, coverage, available, missing, version: SCORING_VERSION };
}

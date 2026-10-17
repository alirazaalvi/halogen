/**
 * Public shape of area scores. Missing scores stay `null`; nothing is defaulted
 * (DR-10, DR-24).
 */

const COLUMN_BY_KEY = {
  overall: "overallScore",
  demographics: "demographicsScore",
  housing: "housingMarketScore",
  transport: "transportScore",
  schools: "schoolsScore",
  safety: "safetyScore",
  green: "greenAreasScore",
  growth: "futureGrowthScore",
} as const;

export type PublicScoreKey = keyof typeof COLUMN_BY_KEY;

export type PublicScores = Record<PublicScoreKey, number | null> & {
  /** Share of the scoring weights backed by data, 0..1, or null when never scored. */
  coverage: number | null;
  /** Score keys that have no value. */
  missing: PublicScoreKey[];
  scoringVersion: string | null;
};

export function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundOneDecimal(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

export function publicScores(scores: Record<string, unknown> | null | undefined): PublicScores {
  const source = scores ?? {};
  const out = {} as Record<PublicScoreKey, number | null>;
  const missing: PublicScoreKey[] = [];

  for (const key of Object.keys(COLUMN_BY_KEY) as PublicScoreKey[]) {
    const raw = toNumeric(source[COLUMN_BY_KEY[key]]);
    out[key] = raw === null ? null : roundOneDecimal(raw);
    if (key !== "overall" && out[key] === null) missing.push(key);
  }

  return {
    ...out,
    coverage: toNumeric(source.dataCoverage),
    missing,
    scoringVersion:
      typeof source.scoringVersion === "string" && source.scoringVersion.length > 0
        ? source.scoringVersion
        : null,
  };
}

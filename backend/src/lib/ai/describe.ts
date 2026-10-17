/**
 * Factual text about an area's scores. Ported from the former Python service so the API can
 * run entirely on Cloudflare Workers. It only restates supplied scores, never fills in
 * missing ones and gives no buy/invest verdict.
 */

export const SCORE_LABELS: Record<string, string> = {
  schools: "Schools",
  transport: "Transport",
  safety: "Safety",
  green: "Green areas",
  growth: "Future growth",
  demographics: "Demographics",
  housing: "Housing stock",
};

export type ScoreMap = Record<string, unknown>;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function describeScores(scores: ScoreMap): { available: string[]; missing: string[] } {
  const available: string[] = [];
  const missing: string[] = [];
  for (const [key, label] of Object.entries(SCORE_LABELS)) {
    const value = num(scores[key]);
    if (value === null) missing.push(label);
    else available.push(`${label}: ${Math.round(value)}/100`);
  }
  return { available, missing };
}

export function chatReply(input: {
  message: string;
  context?: { name: string; region?: string; scores?: ScoreMap };
}): string {
  if (!input.context) {
    return "Tell me which area you are interested in and I can show what data we have for it.";
  }
  const scores = input.context.scores ?? {};
  const { available, missing } = describeScores(scores);
  const overall = num(scores.overall);
  const parts = [
    overall !== null
      ? `${input.context.name}: overall score ${Math.round(overall)}/100.`
      : `${input.context.name} has no overall score yet because too little data is available.`,
  ];
  if (available.length > 0) parts.push(`Available: ${available.join(", ")}.`);
  if (missing.length > 0) parts.push(`No data yet for: ${missing.join(", ")}.`);
  const text = input.message.toLowerCase();
  if (text.includes("buy") || text.includes("invest")) {
    parts.push("I can't give a buy or investment recommendation from this data.");
  }
  return parts.join(" ");
}

export function summary(input: { name: string; region?: string; scores?: ScoreMap }) {
  const scores = input.scores ?? {};
  const { available, missing } = describeScores(scores);
  const overall = num(scores.overall);
  const where = input.region ? ` in ${input.region}` : "";
  return {
    summary:
      overall !== null
        ? `${input.name}${where} scores ${Math.round(overall)}/100 overall.`
        : `${input.name}${where} has no overall score yet.`,
    available,
    missing,
    recommendation: null,
  };
}

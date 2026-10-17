import type { Area, FutureProject, School, ScoreKey, SourceLink } from "../data/areas";

/** Maps backend responses to the Area view model. Missing values stay null (DR-53). */

export function toNumberOrNull(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSourceLinks(input: unknown): SourceLink[] {
  if (!Array.isArray(input)) return [];
  const links: SourceLink[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { label?: unknown; url?: unknown };
    const label = String(raw.label ?? "").trim();
    const url = String(raw.url ?? "").trim();
    if (!label || !url) continue;
    const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ label, url });
  }
  return links;
}

export function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function slugQueryVariants(slug: string): string[] {
  const base = slug.replace(/-/g, " ");
  const variants = new Set<string>([base]);
  for (const v of [base, base.replace(/o/g, "ö")]) {
    variants.add(v);
    variants.add(v.replace(/a/g, "å"));
    variants.add(v.replace(/a/g, "ä"));
  }
  return [...variants].map((v) => v.trim()).filter((v) => v.length > 0);
}

const SCORE_KEYS: ScoreKey[] = [
  "schools",
  "transport",
  "green",
  "growth",
  "safety",
  "housing",
  "demographics",
];

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function normalizeAreaDetails(payload: unknown, slug: string): Area | null {
  const data = asObj(payload);
  const area = asObj(data.area);
  if (!area.id) return null;

  const scoresIn = asObj(data.scores);
  const scores = {} as Record<ScoreKey, number | null>;
  for (const key of SCORE_KEYS) scores[key] = toNumberOrNull(scoresIn[key]);

  const details = asObj(data.details);
  const coords = asObj(area.coordinates);
  const lat = toNumberOrNull(coords.lat);
  const lng = toNumberOrNull(coords.lng);

  const demoIn = details.demographics ? asObj(details.demographics) : null;
  const growthIn = details.growthPrediction ? asObj(details.growthPrediction) : null;

  const schools: School[] = asArr(details.schools).map((s) => {
    const o = asObj(s);
    return {
      name: String(o.name ?? ""),
      address: o.address ? String(o.address) : undefined,
      distance: String(o.distance ?? "-"),
      walkMin: toNumberOrNull(o.walkMin),
      students: toNumberOrNull(o.students),
      performance: toNumberOrNull(o.performance),
      lat: toNumberOrNull(o.lat),
      lng: toNumberOrNull(o.lng),
      inspection: (o.inspection as School["inspection"]) ?? null,
      sourceLinks: normalizeSourceLinks(o.sourceLinks),
    };
  });

  const future: FutureProject[] = asArr(details.future).map((f) => {
    const o = asObj(f);
    return {
      year: Number(o.year),
      title: String(o.title ?? ""),
      type: (o.type as FutureProject["type"]) ?? "Road",
      confidence: toNumberOrNull(o.confidence),
      sourceLinks: normalizeSourceLinks(o.sourceLinks),
    };
  });

  return {
    id: String(area.id),
    slug,
    name: String(area.name ?? titleFromSlug(slug)),
    region: String(area.municipality ?? ""),
    coords: lat !== null && lng !== null ? [lat, lng] : null,
    overall: toNumberOrNull(scoresIn.overall),
    scores,
    coverage: toNumberOrNull(scoresIn.coverage),
    missingScores: asArr(scoresIn.missing).map(String),
    demographics: demoIn
      ? {
          population: toNumberOrNull(demoIn.population),
          year: toNumberOrNull(demoIn.year),
          growth: toNumberOrNull(demoIn.growth),
          medianIncome: toNumberOrNull(demoIn.medianIncome),
          familiesPct: toNumberOrNull(demoIn.familiesPct),
          higherEduPct: toNumberOrNull(demoIn.higherEduPct),
          foreignBornPct: toNumberOrNull(demoIn.foreignBornPct),
          sourceLinks: normalizeSourceLinks(demoIn.sourceLinks),
        }
      : null,
    schools,
    amenities: asArr(details.amenities).map((a) => {
      const o = asObj(a);
      return {
        label: String(o.label ?? ""),
        icon: String(o.icon ?? ""),
        count: Number(o.count ?? 0),
        nearest: String(o.nearest ?? "-"),
        sourceLinks: normalizeSourceLinks(o.sourceLinks),
      };
    }),
    future,
    crimeStats: asArr(details.crimeStats).map((c) => {
      const o = asObj(c);
      const trend = o.trend === "up" || o.trend === "down" || o.trend === "stable" ? o.trend : null;
      return { year: Number(o.year), incidents: toNumberOrNull(o.incidents), trend };
    }),
    growthPrediction: growthIn
      ? {
          level: growthIn.level as "High" | "Medium" | "Low",
          confidence: Number(growthIn.confidence),
          rationale: String(growthIn.rationale ?? ""),
        }
      : null,
  };
}

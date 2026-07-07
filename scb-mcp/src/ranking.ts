import type { CatalogEntry, CatalogFile } from "./catalog.js";

export type Recommendation = {
  entry: CatalogEntry;
  confidence: number;
  reasons: string[];
  alternatives: CatalogEntry[];
};

const FAMILY_HINTS: Record<CatalogEntry["source_family"], string[]> = {
  open_data_root: ["catalog", "overview", "discovery", "index"],
  pxweb: [
    "population",
    "income",
    "education",
    "statistics",
    "table",
    "tabular",
    "json",
    "dataset",
    "query",
    "pxweb",
    "list",
    "codes",
    "metadata",
    "employment",
    "demographics",
    "deso",
    "regso",
  ],
  open_geodata: [
    "geodata",
    "map",
    "polygon",
    "boundary",
    "boundaries",
    "shape",
    "geometry",
    "spatial",
    "wfs",
    "wms",
    "geopackage",
    "deso",
    "regso",
    "localities",
    "grid",
  ],
  myndighetsregistret: ["agency", "authority", "government", "register", "myndighet"],
  branschnyckeltal: ["industry", "ratio", "ratios", "benchmark", "company", "sector"],
  vardefulla_datamangder: ["high-value", "hvd", "eu", "public-sector", "valuable"],
};

function scoreFamily(entry: CatalogEntry, request: string): { score: number; reasons: string[] } {
  const lowerRequest = request.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const wantsAreaCodes = /(deso|regso)/.test(lowerRequest) && /(list|codes|metadata|table|catalog|browse)/.test(lowerRequest);
  const wantsGeometry = /(deso|regso)/.test(lowerRequest) && /(polygon|boundary|geometry|wfs|wms|geodata|map)/.test(lowerRequest);

  for (const hint of FAMILY_HINTS[entry.source_family]) {
    if (lowerRequest.includes(hint)) {
      score += 2;
      reasons.push(`Matched "${hint}" to ${entry.source_family}.`);
    }
  }

  for (const tag of entry.best_for) {
    if (lowerRequest.includes(tag.replace(/-/g, " "))) {
      score += 3;
      reasons.push(`Use-case tag "${tag}" matches the request.`);
    }
  }

  if (entry.priority === "high") {
    score += 1;
  }

  if (wantsAreaCodes && entry.source_family === "pxweb") {
    score += 6;
    reasons.push("DeSO/RegSO list-style request prefers PxWeb metadata tables.");
  }

  if (wantsGeometry && entry.source_family === "open_geodata") {
    score += 6;
    reasons.push("DeSO/RegSO geometry request prefers Open Geodata.");
  }

  return { score, reasons };
}

export function recommendApi(catalog: CatalogFile, request: string): Recommendation {
  const ranked = catalog.entries
    .map((entry) => {
      const { score, reasons } = scoreFamily(entry, request);
      return { entry, score, reasons };
    })
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title, "en"));

  const top = ranked[0];
  const alternatives = ranked.filter((candidate) => candidate.entry.id !== top.entry.id && candidate.score > 0).slice(0, 3);
  const confidence = Math.max(0.2, Math.min(0.99, 0.3 + top.score / 12));

  return {
    entry: top.entry,
    confidence: Number(confidence.toFixed(2)),
    reasons:
      top.reasons.length > 0
        ? top.reasons
        : [`Defaulted to ${top.entry.source_family} because it is the strongest project fit in the catalog.`],
    alternatives: alternatives.map((candidate) => candidate.entry),
  };
}

import { normalizeDistrictAlias } from "../district-aliases";

export const NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES = ["0180", "0163", "0184", "0183"] as const;

export type NamedDistrictPilotMunicipalityCode =
  (typeof NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES)[number];

export type NamedDistrictSeed = {
  id: string;
  municipality_code: string;
  name: string;
  normalized_name: string;
  source_type: "official_boundary" | "seeded_centroid";
  source_id: string | null;
  geometry: unknown | null;
  centroid: { lat: number; lng: number } | null;
  description: string | null;
  raw_data: Record<string, unknown>;
  legacy_district_id?: string | null;
};

const STOCKHOLM_OFFICIAL_DISTRICTS_URL =
  "https://raw.githubusercontent.com/krasch/stockholm-stadsdelar/master/geojson/simplified/stadsdelar_utan_vatten.geo.json";

function slugifySegment(value: string): string {
  return normalizeDistrictAlias(value).replace(/\s+/g, "-");
}

export function buildNamedDistrictId(municipalityCode: string, name: string): string {
  return `ND-${municipalityCode}-${slugifySegment(name)}`;
}

function extractStockholmDistrictName(feature: unknown): string | null {
  if (!feature || typeof feature !== "object") {
    return null;
  }

  const properties =
    "properties" in feature && feature.properties && typeof feature.properties === "object"
      ? (feature.properties as Record<string, unknown>)
      : null;
  const rawName = String(properties?.name ?? "").trim();
  if (!rawName) {
    return null;
  }

  return rawName
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function fetchStockholmOfficialNamedDistrictSeeds(): Promise<NamedDistrictSeed[]> {
  const response = await fetch(STOCKHOLM_OFFICIAL_DISTRICTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Stockholm districts: ${response.status}`);
  }

  const payload = (await response.json()) as {
    features?: Array<Record<string, unknown>>;
  };
  const features = Array.isArray(payload.features) ? payload.features : [];
  const seeds: NamedDistrictSeed[] = [];

  for (const feature of features) {
    const geometry =
      feature && typeof feature === "object" && "geometry" in feature
        ? (feature.geometry ?? null)
        : null;
    const name = extractStockholmDistrictName(feature);

    if (!name || !geometry) {
      continue;
    }

    seeds.push({
      id: buildNamedDistrictId("0180", name),
      municipality_code: "0180",
      name,
      normalized_name: normalizeDistrictAlias(name),
      source_type: "official_boundary",
      source_id: name,
      geometry,
      centroid: null,
      description: "Named district from Stockholm open district boundaries.",
      raw_data: {
        source: "stockholm_open_district_boundaries",
        source_url: STOCKHOLM_OFFICIAL_DISTRICTS_URL,
        source_name: name,
      },
    });
  }

  return seeds;
}

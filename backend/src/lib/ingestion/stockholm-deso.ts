import { type DesoListItem, fetchDesoList } from "../../../../scb-mcp/src/pxweb.js";

export type StockholmDesoSeed = {
  deso_id: string;
  area_name: string;
  district_id: string;
  district_name: string;
  municipality_code: string;
  municipality_name: string;
  county_code: string;
  source_code: string;
  version: "2025" | "legacy" | "other";
};

export type StockholmDesoGeometryRecord = {
  deso_id: string;
  municipality_code: string;
  county_code: string;
  regso_code: string | null;
  version: string | null;
  geometry: Record<string, unknown>;
  raw_feature: Record<string, unknown>;
};

type MunicipalityLookup = Map<string, string> | Record<string, string>;

function municipalityNameFromLookup(
  lookup: MunicipalityLookup,
  municipalityCode: string,
): string | null {
  if (lookup instanceof Map) {
    return lookup.get(municipalityCode) ?? null;
  }

  return typeof lookup[municipalityCode] === "string" ? lookup[municipalityCode] : null;
}

export function buildCompatibilityDistrictId(desoId: string): string {
  return `DESO-${desoId}`;
}

export function buildCompatibilityDistrictName(desoId: string): string {
  return `DeSO ${desoId}`;
}

export function normalizeStockholmCountyDesoItems(
  items: DesoListItem[],
  municipalityLookup: MunicipalityLookup,
): StockholmDesoSeed[] {
  const seen = new Set<string>();
  const seeds: StockholmDesoSeed[] = [];

  for (const item of items) {
    if (item.level !== "deso" || item.county_code !== "01" || item.version !== "2025") {
      continue;
    }

    if (!item.code || !item.municipality_code || seen.has(item.code)) {
      continue;
    }

    const municipalityName =
      municipalityNameFromLookup(municipalityLookup, item.municipality_code) ??
      item.municipality_code;

    seeds.push({
      deso_id: item.code,
      area_name: buildCompatibilityDistrictName(item.code),
      district_id: buildCompatibilityDistrictId(item.code),
      district_name: buildCompatibilityDistrictName(item.code),
      municipality_code: item.municipality_code,
      municipality_name: municipalityName,
      county_code: item.county_code ?? "01",
      source_code: item.source_code,
      version: item.version,
    });
    seen.add(item.code);
  }

  return seeds.sort((left, right) => left.deso_id.localeCompare(right.deso_id, "sv"));
}

export async function discoverStockholmCountyDesoSeeds(
  municipalityLookup: MunicipalityLookup,
): Promise<StockholmDesoSeed[]> {
  const result = await fetchDesoList({
    countyCode: "01",
    version: "2025",
    limit: 5000,
  });

  return normalizeStockholmCountyDesoItems(result.items, municipalityLookup);
}

export function extractStockholmCountyDesoGeometries(
  payload: unknown,
): StockholmDesoGeometryRecord[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const features = Array.isArray(root.features) ? root.features : [];
  const rows: StockholmDesoGeometryRecord[] = [];

  for (const feature of features) {
    if (!feature || typeof feature !== "object") {
      continue;
    }

    const record = feature as Record<string, unknown>;
    const properties =
      record.properties && typeof record.properties === "object"
        ? (record.properties as Record<string, unknown>)
        : null;
    const geometry =
      record.geometry && typeof record.geometry === "object"
        ? (record.geometry as Record<string, unknown>)
        : null;

    if (!properties || !geometry) {
      continue;
    }

    const desoId = String(properties.desokod ?? "");
    const municipalityCode = String(properties.kommunkod ?? "");
    const countyCode = String(properties.lanskod ?? "");
    const geometryType = String(geometry.type ?? "");

    if (
      !desoId ||
      !municipalityCode ||
      countyCode !== "01" ||
      (geometryType !== "Polygon" && geometryType !== "MultiPolygon")
    ) {
      continue;
    }

    rows.push({
      deso_id: desoId,
      municipality_code: municipalityCode,
      county_code: countyCode,
      regso_code: properties.regsokod ? String(properties.regsokod) : null,
      version: properties.version ? String(properties.version) : null,
      geometry,
      raw_feature: record,
    });
  }

  return rows.sort((left, right) => left.deso_id.localeCompare(right.deso_id, "sv"));
}

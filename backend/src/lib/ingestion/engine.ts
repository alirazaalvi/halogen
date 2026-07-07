import { pool } from "../../db/connection";
import { normalizeDistrictAlias } from "../district-aliases";
import {
  buildNamedDistrictId,
  fetchStockholmOfficialNamedDistrictSeeds,
  NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES,
  type NamedDistrictSeed,
} from "./named-districts";
import {
  discoverStockholmCountyDesoSeeds,
  extractStockholmCountyDesoGeometries,
  type StockholmDesoGeometryRecord,
} from "./stockholm-deso";
import { STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS } from "./stockholm-district-aliases";

const PILOT_NAMED_DISTRICT_CENTROID_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  "ND-0183-hallonbergen": { lat: 59.37537, lng: 17.96907 },
  "ND-0183-rissne": { lat: 59.37583, lng: 17.93972 },
  "ND-0184-hagalund": { lat: 59.36262, lng: 18.0134 },
};

type SourceLink = {
  label: string;
  url: string;
};

type DemographicRecord = {
  deso_id: string;
  year: number;
  population_total: number;
  population_growth: number;
  median_income: number;
  higher_edu_pct: number;
  foreign_born_pct: number;
  families_with_kids_pct: number;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type SchoolRecord = {
  deso_id?: string;
  district_id?: string;
  school_unit_code?: string;
  school_status?: string;
  municipality_code?: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  performance: number;
  students: number;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type StopRecord = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  routes: number;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type PropertyRecord = {
  property_id: string;
  address: string;
  lat: number;
  lng: number;
  building_year: number;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type SmhiRecord = {
  deso_id: string;
  year: number;
  source_station: string;
  flood_risk: number;
  green_space_ratio: number;
  air_quality_index: number;
  temperature_avg: number;
  rainfall_mm: number;
  wind_exposure_index: number;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type MunicipalProjectRecord = {
  external_id: string;
  title: string;
  project_type: string;
  lat: number;
  lng: number;
  status: string;
  confidence: number;
  source_municipality: string;
  source_links?: SourceLink[];
  raw_data?: Record<string, unknown>;
};

type StockholmAreaSeed = {
  deso_id: string;
  area_name: string;
  municipality_code: string;
  municipality_name: string;
};

type StockholmMunicipalitySeed = {
  municipality_code: string;
  municipality_name: string;
};

type DistrictSeed = {
  district_id: string;
  district_name: string;
  municipality_name: string;
  municipality_code: string;
  deso_id?: string | null;
  district_type?: string | null;
};

export class IngestionEngine {
  private readonly regions: string[];
  private readonly municipalitySchoolCache: Map<string, Promise<SchoolRecord[]>>;
  private stockholmCountyDistrictCoveragePromise: Promise<void> | null;

  constructor() {
    this.regions = ["Stockholm", "Gothenburg", "Malmö"];
    this.municipalitySchoolCache = new Map();
    this.stockholmCountyDistrictCoveragePromise = null;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  }

  private toArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private toNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  private roundScore(value: number): number {
    return Math.round(this.clampScore(value) * 100) / 100;
  }

  private dedupeSourceLinks(links: SourceLink[]): SourceLink[] {
    const seen = new Set<string>();
    const result: SourceLink[] = [];

    for (const link of links) {
      const label = link.label?.trim();
      const url = link.url?.trim();
      if (!label || !url) {
        continue;
      }

      const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push({ label, url });
    }

    return result;
  }

  private staticSource(label: string, url: string): SourceLink[] {
    return [{ label, url }];
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private areaFactor(desoId: string, salt: string, min: number, max: number): number {
    const hash = this.hashString(`${desoId}:${salt}`);
    const normalized = (hash % 1000) / 1000;
    return min + normalized * (max - min);
  }

  private areaInt(desoId: string, salt: string, min: number, max: number): number {
    const n = this.areaFactor(desoId, salt, min, max);
    return Math.round(n);
  }

  private areaTrend(desoId: string): "up" | "down" | "stable" {
    const v = this.hashString(`${desoId}:trend`) % 3;
    if (v === 0) return "down";
    if (v === 1) return "stable";
    return "up";
  }

  private areaAnchor(desoId: string): { lat: number; lng: number } {
    return {
      lat: this.areaFactor(desoId, "lat", 59.05, 59.65),
      lng: this.areaFactor(desoId, "lng", 17.4, 18.5),
    };
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }

    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  private logProgress(scope: string, message: string): void {
    console.log(`[${scope}] ${message}`);
  }

  private logStepStart(scope: string, step: string, detail?: string): number {
    this.logProgress(scope, `${step} started${detail ? `: ${detail}` : ""}`);
    return Date.now();
  }

  private logStepDone(scope: string, step: string, startedAt: number, detail?: string): void {
    const elapsed = this.formatDuration(Date.now() - startedAt);
    this.logProgress(scope, `${step} done in ${elapsed}${detail ? `: ${detail}` : ""}`);
  }

  private async upsertDistrictAlias(options: {
    districtId: string;
    aliasName: string;
    aliasKind: "display" | "search";
    source: string;
    priority: number;
    isDisplay: boolean;
    rawData?: Record<string, unknown>;
  }): Promise<void> {
    const aliasName = options.aliasName.trim();
    if (!aliasName) {
      return;
    }

    await pool.query(
      `INSERT INTO district_aliases (
         district_id,
         alias_name,
         normalized_alias,
         alias_kind,
         source,
         priority,
         is_display,
         raw_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (district_id, normalized_alias) DO UPDATE SET
         alias_name = EXCLUDED.alias_name,
         alias_kind = EXCLUDED.alias_kind,
         source = EXCLUDED.source,
         priority = EXCLUDED.priority,
         is_display = EXCLUDED.is_display,
         raw_data = COALESCE(district_aliases.raw_data, '{}'::jsonb) || EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        options.districtId,
        aliasName,
        normalizeDistrictAlias(aliasName),
        options.aliasKind,
        options.source,
        options.priority,
        options.isDisplay,
        JSON.stringify(options.rawData ?? {}),
      ],
    );
  }

  private async findNearestCompatibilityDistrictId(
    municipalityCode: string,
    lng: number,
    lat: number,
  ): Promise<string | null> {
    const result = await pool.query(
      `SELECT d.id
       FROM districts d
       JOIN municipalities m ON m.id = d.municipality_id
       WHERE d.type = 'deso_compat'
         AND m.code = $1
       ORDER BY ST_Distance(
         COALESCE(d.geometry, d.centroid)::geography,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
       ) ASC
       LIMIT 1`,
      [municipalityCode, lng, lat],
    );

    return result.rows[0]?.id ? String(result.rows[0].id) : null;
  }

  private async syncStockholmDistrictAliases(): Promise<{
    aliasesSynced: number;
    displayNamesUpdated: number;
  }> {
    await pool.query(
      `DELETE FROM district_aliases
       WHERE source = ANY($1::varchar[])`,
      [["stockholm_manual_seed", "legacy_district_seed"]],
    );

    let aliasesSynced = 0;

    for (const seed of STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS) {
      const districtId = await this.findNearestCompatibilityDistrictId(
        seed.municipality_code,
        seed.lng,
        seed.lat,
      );

      if (!districtId) {
        continue;
      }

      const searchAliases = new Set([seed.display_name, ...(seed.search_aliases ?? [])]);
      for (const aliasName of searchAliases) {
        await this.upsertDistrictAlias({
          districtId,
          aliasName,
          aliasKind: aliasName === seed.display_name ? "display" : "search",
          source: "stockholm_manual_seed",
          priority: seed.priority ?? 25,
          isDisplay: aliasName === seed.display_name,
          rawData: {
            municipality_code: seed.municipality_code,
            seeded_display_name: seed.display_name,
            lat: seed.lat,
            lng: seed.lng,
          },
        });
        aliasesSynced += 1;
      }
    }

    const legacyRows = await pool.query(
      `SELECT
         d.id AS legacy_id,
         d.name AS legacy_name,
         m.code AS municipality_code,
         ST_X(d.centroid) AS lng,
         ST_Y(d.centroid) AS lat
       FROM districts d
       JOIN municipalities m ON m.id = d.municipality_id
       WHERE d.centroid IS NOT NULL
         AND d.name IS NOT NULL
         AND COALESCE(d.type, '') <> 'deso_compat'
         AND COALESCE(d.type, '') <> 'municipality'
         AND d.deso_id IS NULL`,
    );

    for (const row of legacyRows.rows) {
      const aliasName = String(row.legacy_name ?? "").trim();
      const municipalityCode = String(row.municipality_code ?? "").trim();
      const lng = Number(row.lng);
      const lat = Number(row.lat);

      if (!aliasName || !municipalityCode || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        continue;
      }

      const districtId = await this.findNearestCompatibilityDistrictId(municipalityCode, lng, lat);
      if (!districtId) {
        continue;
      }

      await this.upsertDistrictAlias({
        districtId,
        aliasName,
        aliasKind: "display",
        source: "legacy_district_seed",
        priority: 200,
        isDisplay: true,
        rawData: {
          legacy_id: String(row.legacy_id ?? ""),
          municipality_code: municipalityCode,
          lat,
          lng,
        },
      });
      aliasesSynced += 1;
    }

    const displayUpdate = await pool.query(
      `UPDATE districts d
       SET name = best.alias_name,
           raw_data = COALESCE(d.raw_data, '{}'::jsonb) || jsonb_build_object(
             'display_alias',
             jsonb_build_object(
               'name', best.alias_name,
               'source', best.source,
               'priority', best.priority
             )
           ),
           updated_at = NOW()
       FROM (
         SELECT DISTINCT ON (district_id)
           district_id,
           alias_name,
           source,
           priority
         FROM district_aliases
         WHERE is_display = TRUE
         ORDER BY district_id, priority ASC, alias_name ASC
       ) best
       WHERE d.id = best.district_id
         AND d.type = 'deso_compat'
         AND d.name IS DISTINCT FROM best.alias_name`,
    );

    return {
      aliasesSynced,
      displayNamesUpdated: displayUpdate.rowCount ?? 0,
    };
  }

  private pilotNamedDistrictMunicipalityCodes(): string[] {
    return [...NAMED_DISTRICT_PILOT_MUNICIPALITY_CODES];
  }

  private async upsertNamedDistrict(
    seed: NamedDistrictSeed,
    municipalityId: number,
  ): Promise<void> {
    const geometryGeoJson = seed.geometry ? JSON.stringify(seed.geometry) : null;
    const centroidLng = seed.centroid?.lng ?? null;
    const centroidLat = seed.centroid?.lat ?? null;

    await pool.query(
      `INSERT INTO named_districts (
         id,
         municipality_id,
         source_municipality_code,
         name,
         normalized_name,
         source_type,
         source_id,
         legacy_district_id,
         geometry,
         centroid,
         description,
         raw_data
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         CASE
           WHEN $9::text IS NULL THEN NULL
           ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($9), 4326))
         END,
         COALESCE(
           CASE
             WHEN $9::text IS NULL THEN NULL
             ELSE ST_PointOnSurface(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($9), 4326)))
           END,
           CASE
             WHEN $10::double precision IS NULL OR $11::double precision IS NULL THEN NULL
             ELSE ST_SetSRID(ST_MakePoint($10, $11), 4326)
           END
         ),
         $12,
         $13::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         municipality_id = EXCLUDED.municipality_id,
         source_municipality_code = EXCLUDED.source_municipality_code,
         name = EXCLUDED.name,
         normalized_name = EXCLUDED.normalized_name,
         source_type = EXCLUDED.source_type,
         source_id = EXCLUDED.source_id,
         legacy_district_id = EXCLUDED.legacy_district_id,
         geometry = COALESCE(EXCLUDED.geometry, named_districts.geometry),
         centroid = COALESCE(EXCLUDED.centroid, named_districts.centroid),
         description = EXCLUDED.description,
         raw_data = COALESCE(named_districts.raw_data, '{}'::jsonb) || EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        seed.id,
        municipalityId,
        seed.municipality_code,
        seed.name,
        seed.normalized_name,
        seed.source_type,
        seed.source_id,
        seed.legacy_district_id ?? null,
        geometryGeoJson,
        centroidLng,
        centroidLat,
        seed.description,
        JSON.stringify(seed.raw_data),
      ],
    );
  }

  private async loadSeededPilotNamedDistricts(): Promise<NamedDistrictSeed[]> {
    const result = await pool.query(
      `SELECT
         d.id AS legacy_district_id,
         d.name,
         d.description,
         m.code AS municipality_code,
         ST_X(d.centroid) AS lng,
         ST_Y(d.centroid) AS lat
       FROM districts d
       JOIN municipalities m ON m.id = d.municipality_id
       WHERE m.code = ANY($1::varchar[])
         AND m.code <> '0180'
         AND d.centroid IS NOT NULL
         AND d.name IS NOT NULL
         AND COALESCE(d.type, '') <> 'deso_compat'
         AND COALESCE(d.type, '') <> 'municipality'
         AND d.deso_id IS NULL`,
      [this.pilotNamedDistrictMunicipalityCodes()],
    );

    const aliasLookup = new Map(
      STOCKHOLM_MANUAL_DISTRICT_ALIAS_SEEDS.map((seed) => [
        `${seed.municipality_code}:${normalizeDistrictAlias(seed.display_name)}`,
        seed,
      ]),
    );

    return result.rows.map((row) => {
      const name = String(row.name ?? "").trim();
      const municipalityCode = String(row.municipality_code ?? "").trim();
      const districtId = buildNamedDistrictId(municipalityCode, name);
      const aliasSeed = aliasLookup.get(`${municipalityCode}:${normalizeDistrictAlias(name)}`);
      const centroidOverride = PILOT_NAMED_DISTRICT_CENTROID_OVERRIDES[districtId];

      return {
        id: districtId,
        municipality_code: municipalityCode,
        name,
        normalized_name: normalizeDistrictAlias(name),
        source_type: "seeded_centroid",
        source_id: String(row.legacy_district_id ?? ""),
        geometry: null,
        centroid: centroidOverride ?? {
          lat: Number(row.lat),
          lng: Number(row.lng),
        },
        description: row.description ? String(row.description) : null,
        raw_data: {
          source: "legacy_seeded_districts",
          legacy_district_id: String(row.legacy_district_id ?? ""),
          centroid_override: centroidOverride ?? null,
          search_aliases: aliasSeed?.search_aliases ?? [],
        },
        legacy_district_id: String(row.legacy_district_id ?? ""),
      } satisfies NamedDistrictSeed;
    });
  }

  private async syncPilotNamedDistricts(): Promise<{
    districtsSynced: number;
    officialDistricts: number;
    seededDistricts: number;
  }> {
    const codes = this.pilotNamedDistrictMunicipalityCodes();
    await pool.query(
      `DELETE FROM named_districts
       WHERE source_municipality_code = ANY($1::varchar[])`,
      [codes],
    );

    const officialStockholmSeeds = await fetchStockholmOfficialNamedDistrictSeeds();
    const seededRows = await this.loadSeededPilotNamedDistricts();
    const seeds = [...officialStockholmSeeds, ...seededRows];

    const municipalityRows = await pool.query(
      `SELECT id, code
       FROM municipalities
       WHERE code = ANY($1::varchar[])`,
      [codes],
    );
    const municipalityIds = new Map<string, number>(
      municipalityRows.rows.map((row) => [String(row.code), Number(row.id)]),
    );

    let districtsSynced = 0;
    let officialDistricts = 0;
    let seededDistricts = 0;

    for (const seed of seeds) {
      const municipalityId = municipalityIds.get(seed.municipality_code);
      if (!municipalityId) {
        continue;
      }

      await this.upsertNamedDistrict(seed, municipalityId);
      districtsSynced += 1;
      if (seed.source_type === "official_boundary") {
        officialDistricts += 1;
      } else {
        seededDistricts += 1;
      }
    }

    return {
      districtsSynced,
      officialDistricts,
      seededDistricts,
    };
  }

  private async rebuildPilotNamedDistrictCrosswalk(): Promise<{
    mappedDistricts: number;
    crosswalkRows: number;
  }> {
    const pilotRows = await pool.query(
      `SELECT id
       FROM named_districts
       WHERE source_municipality_code = ANY($1::varchar[])`,
      [this.pilotNamedDistrictMunicipalityCodes()],
    );
    const districtIds = pilotRows.rows.map((row) => String(row.id));
    if (districtIds.length === 0) {
      return { mappedDistricts: 0, crosswalkRows: 0 };
    }

    await pool.query(
      `DELETE FROM named_district_deso_map
       WHERE district_id = ANY($1::varchar[])`,
      [districtIds],
    );

    const polygonInsert = await pool.query(
      `INSERT INTO named_district_deso_map (
         district_id,
         deso_id,
         mapping_method,
         overlap_ratio,
         priority_weight,
         raw_data
       )
       SELECT
         nd.id,
         da.id,
         'polygon_overlap',
         LEAST(
           1.0,
           ST_Area(ST_Intersection(nd.geometry, da.geometry)::geography) /
             NULLIF(ST_Area(nd.geometry::geography), 0)
         )::numeric(10, 6),
         GREATEST(
           0.01,
           LEAST(
             1.0,
             ST_Area(ST_Intersection(nd.geometry, da.geometry)::geography) /
               NULLIF(ST_Area(nd.geometry::geography), 0)
           )
         )::numeric(10, 6),
         jsonb_build_object(
           'source', 'named_district_polygon_overlap',
           'municipality_code', nd.source_municipality_code
         )
       FROM named_districts nd
       JOIN deso_areas da
         ON da.municipality_id = nd.municipality_id
        AND da.geometry IS NOT NULL
       WHERE nd.id = ANY($1::varchar[])
         AND nd.geometry IS NOT NULL
         AND ST_Intersects(nd.geometry, da.geometry)
         AND ST_Area(ST_Intersection(nd.geometry, da.geometry)::geography) > 0`,
      [districtIds],
    );

    const centroidInsert = await pool.query(
      `INSERT INTO named_district_deso_map (
         district_id,
         deso_id,
         mapping_method,
         overlap_ratio,
         priority_weight,
         raw_data
       )
       SELECT DISTINCT ON (nd.id)
         nd.id,
         da.id,
         CASE
           WHEN ST_Contains(da.geometry, nd.centroid) THEN 'centroid_contains'
           ELSE 'nearest_fallback'
         END,
         1.0,
         1.0,
         jsonb_build_object(
           'source', 'named_district_centroid_map',
           'municipality_code', nd.source_municipality_code
         )
       FROM named_districts nd
       JOIN deso_areas da
         ON da.municipality_id = nd.municipality_id
        AND da.geometry IS NOT NULL
       WHERE nd.id = ANY($1::varchar[])
         AND nd.geometry IS NULL
         AND nd.centroid IS NOT NULL
       ORDER BY
         nd.id,
         CASE WHEN ST_Contains(da.geometry, nd.centroid) THEN 0 ELSE 1 END,
         ST_Distance(da.geometry::geography, nd.centroid::geography) ASC`,
      [districtIds],
    );

    return {
      mappedDistricts: districtIds.length,
      crosswalkRows: (polygonInsert.rowCount ?? 0) + (centroidInsert.rowCount ?? 0),
    };
  }

  private stockholmCountyMunicipalityCodes(): Set<string> {
    return new Set([
      "0114",
      "0115",
      "0117",
      "0120",
      "0123",
      "0125",
      "0126",
      "0127",
      "0128",
      "0136",
      "0138",
      "0139",
      "0140",
      "0160",
      "0162",
      "0163",
      "0180",
      "0181",
      "0182",
      "0183",
      "0184",
      "0186",
      "0187",
      "0188",
      "0191",
      "0192",
    ]);
  }

  private normalizeCoordinatePair(
    lat: number,
    lng: number,
    fallback: { lat: number; lng: number },
    offset: number,
  ): { lat: number; lng: number } {
    const validLat = Number.isFinite(lat) && Math.abs(lat) > 1;
    const validLng = Number.isFinite(lng) && Math.abs(lng) > 1;

    if (validLat && validLng) {
      return { lat, lng };
    }

    return {
      lat: fallback.lat + offset * 0.001,
      lng: fallback.lng + offset * 0.001,
    };
  }

  private buildDemographicProfile(
    desoId: string,
    populationTotal: number,
  ): Omit<DemographicRecord, "deso_id" | "year" | "population_total"> {
    const populationGrowth = Number(this.areaFactor(desoId, "growth", -1.2, 5.8).toFixed(2));
    const medianIncome = this.areaInt(desoId, "income", 330000, 560000);
    const higherEduPct = this.areaInt(desoId, "edu", 28, 74);
    const foreignBornPct = this.areaInt(desoId, "foreign", 6, 48);
    const kidsBase = populationTotal > 30000 ? 32 : 38;
    const familiesWithKidsPct = this.areaInt(desoId, "kids", kidsBase - 10, kidsBase + 18);

    return {
      population_growth: populationGrowth,
      median_income: medianIncome,
      higher_edu_pct: higherEduPct,
      foreign_born_pct: foreignBornPct,
      families_with_kids_pct: familiesWithKidsPct,
    };
  }

  private fallbackSmhiObservation(desoId: string, year: number): SmhiRecord {
    const temperature = Number(this.areaFactor(desoId, "temperature", 5.2, 10.9).toFixed(2));
    const rainfall = Number(this.areaFactor(desoId, "rainfall", 460, 760).toFixed(1));

    return {
      deso_id: desoId,
      year,
      source_station: `SMHI-${desoId}`,
      flood_risk: Number(this.areaFactor(desoId, "flood", 8.5, 34.5).toFixed(2)),
      green_space_ratio: Number(this.areaFactor(desoId, "green", 16.5, 46.5).toFixed(2)),
      air_quality_index: Number(this.areaFactor(desoId, "air", 18.2, 49.8).toFixed(2)),
      temperature_avg: temperature,
      rainfall_mm: rainfall,
      wind_exposure_index: Number(this.areaFactor(desoId, "wind", 2.1, 7.2).toFixed(2)),
    };
  }

  private async ensureMunicipality(region: string): Promise<number> {
    const regionConfig: Record<string, { code: string; population: number }> = {
      Stockholm: { code: "0180", population: 975551 },
      Gothenburg: { code: "1480", population: 587549 },
      Malmö: { code: "1280", population: 362133 },
      Malmo: { code: "1280", population: 362133 },
    };

    const cfg = regionConfig[region] ?? {
      code:
        region
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 10) || "0000",
      population: 0,
    };

    const rawData = {
      source: "ingestion.ensureMunicipality",
      region,
      code: cfg.code,
      population: cfg.population,
    };

    const result = await pool.query(
      `INSERT INTO municipalities (name, code, population, raw_data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         population = COALESCE(EXCLUDED.population, municipalities.population),
         raw_data = EXCLUDED.raw_data
       RETURNING id`,
      [region, cfg.code, cfg.population, JSON.stringify(rawData)],
    );

    return Number(result.rows[0]?.id);
  }

  private async getMunicipalityByCode(
    code: string,
  ): Promise<{ id: number; name: string; code: string } | null> {
    if (!code) {
      return null;
    }

    const result = await pool.query(
      `SELECT id, name, code
       FROM municipalities
       WHERE code = $1
       LIMIT 1`,
      [code],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      name: String(row.name),
      code: String(row.code),
    };
  }

  private async upsertOfficialMunicipality(
    municipalityCode: string,
    municipalityName: string,
    rawData?: Record<string, unknown>,
  ): Promise<{ id: number; name: string; code: string }> {
    const result = await pool.query(
      `INSERT INTO municipalities (name, code, raw_data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         raw_data = COALESCE(municipalities.raw_data, '{}'::jsonb) || EXCLUDED.raw_data
       RETURNING id, name, code`,
      [
        municipalityName,
        municipalityCode,
        JSON.stringify(
          rawData ?? {
            source: "ingestion.official_municipality",
            municipality_code: municipalityCode,
            municipality_name: municipalityName,
          },
        ),
      ],
    );

    return {
      id: Number(result.rows[0].id),
      name: String(result.rows[0].name),
      code: String(result.rows[0].code),
    };
  }

  private async ensureDesoArea(
    desoId: string,
    options?: {
      areaName?: string;
      region?: string;
      municipalityCode?: string;
      municipalityName?: string;
      geometryGeoJson?: string | null;
      geometryRawData?: Record<string, unknown> | null;
    },
  ) {
    const municipalityCode = options?.municipalityCode ?? desoId.slice(0, 4);
    const municipalityName = options?.municipalityName?.trim();
    const municipalityRef =
      municipalityCode.length === 4
        ? municipalityName
          ? await this.upsertOfficialMunicipality(municipalityCode, municipalityName, {
              source: "ingestion.ensureDesoArea.municipality",
              municipality_code: municipalityCode,
              municipality_name: municipalityName,
            })
          : await this.getMunicipalityByCode(municipalityCode)
        : null;
    const municipalityId =
      municipalityRef?.id ??
      (options?.region ? await this.ensureMunicipality(options.region) : null);
    const normalizedName = options?.areaName?.trim();
    const geometryGeoJson = options?.geometryGeoJson ?? null;
    const anchor = this.areaAnchor(desoId);
    const rawData = {
      source: "ingestion.ensureDesoArea",
      deso_id: desoId,
      area_name: normalizedName ?? desoId,
      region: options?.region ?? null,
      municipality_code: municipalityCode || null,
      municipality_name: municipalityRef?.name ?? municipalityName ?? null,
      municipality_id: municipalityId,
      geometry_source: geometryGeoJson ? "scb_open_geodata" : null,
      geometry_metadata: options?.geometryRawData ?? null,
    };

    await pool.query(
      `INSERT INTO deso_areas (id, name, municipality_id, area_km2, geometry, centroid, raw_data)
       VALUES (
         $1,
         COALESCE($2, $4),
         $3,
         CASE
           WHEN $5::text IS NULL THEN NULL
           ELSE ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)::geography) / 1000000.0
         END,
         CASE
           WHEN $5::text IS NULL THEN NULL
           ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
         END,
         COALESCE(
           ST_PointOnSurface(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))),
           ST_SetSRID(ST_MakePoint($6, $7), 4326)
         ),
         $8::jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         name = CASE
           WHEN deso_areas.name IS NULL OR deso_areas.name ~ '^Area\\s'
             THEN COALESCE(EXCLUDED.name, deso_areas.name)
           ELSE deso_areas.name
         END,
         municipality_id = COALESCE(deso_areas.municipality_id, EXCLUDED.municipality_id),
         area_km2 = COALESCE(EXCLUDED.area_km2, deso_areas.area_km2),
         geometry = COALESCE(EXCLUDED.geometry, deso_areas.geometry),
         centroid = COALESCE(EXCLUDED.centroid, deso_areas.centroid),
         raw_data = COALESCE(deso_areas.raw_data, '{}'::jsonb) || EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        desoId,
        normalizedName ?? null,
        municipalityId,
        desoId,
        geometryGeoJson,
        anchor.lng,
        anchor.lat,
        JSON.stringify(rawData),
      ],
    );
  }

  private parseLantmaterietAtom(xml: string, desoId: string): PropertyRecord[] {
    const entries = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/g)];

    const rows = entries.map((entry, index) => {
      const block = entry[0];
      const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      const id = block.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1]?.trim();
      const pos = block.match(/<gml:pos[^>]*>([\s\S]*?)<\/gml:pos>/i)?.[1]?.trim();

      const [a, b] = (pos ?? "").split(/\s+/).map((v) => this.toNumber(v, Number.NaN));
      const latCandidate = Number.isFinite(a) ? a : 59.4044 + index * 0.001;
      const lngCandidate = Number.isFinite(b) ? b : 17.9489 + index * 0.001;

      const likelyLat = Math.abs(latCandidate) <= 90 ? latCandidate : lngCandidate;
      const likelyLng = Math.abs(latCandidate) <= 90 ? lngCandidate : latCandidate;

      return {
        property_id: id?.slice(-50) || `PROP-${desoId}-${index + 1}`,
        address: title || `Address ${index + 1}, ${desoId}`,
        lat: likelyLat,
        lng: likelyLng,
        building_year: this.areaInt(desoId, `building:${index}`, 1965, 2023),
      } satisfies PropertyRecord;
    });

    return rows;
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
    label: string,
    timeoutMs = 20000,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${label} request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${label} request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isInactiveSchoolStatus(status: unknown): boolean {
    const normalized = String(status ?? "")
      .trim()
      .toUpperCase();
    return normalized === "UPPHORT" || normalized === "VILANDE" || normalized === "AVREGISTRERAD";
  }

  private parseSchoolGeoCoordinates(value: unknown): { lat: number; lng: number } | null {
    const record = this.toRecord(value);
    if (!record) {
      return null;
    }

    const directPairs: Array<{ lat: unknown; lng: unknown }> = [
      { lat: record.lat, lng: record.lng },
      { lat: record.latitude, lng: record.longitude },
      { lat: record.y, lng: record.x },
    ];

    for (const pair of directPairs) {
      const lat = Number(pair.lat);
      const lng = Number(pair.lng);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return { lat, lng };
      }
    }

    const coordinates = this.toArray(record.coordinates);
    if (coordinates.length >= 2) {
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
      ) {
        return { lat, lng };
      }
    }

    return null;
  }

  private async geocodeSchoolAddress(
    streetAddress: string,
    postalCode: string,
    locality: string,
    cache: Map<string, { lat: number; lng: number } | null>,
  ): Promise<{ lat: number; lng: number } | null> {
    const cacheKey = `${streetAddress}|${postalCode}|${locality}`.toLowerCase();
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) ?? null;
    }

    const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
    searchUrl.searchParams.set("street", streetAddress);
    if (postalCode) {
      searchUrl.searchParams.set("postalcode", postalCode);
    }
    if (locality) {
      searchUrl.searchParams.set("city", locality);
    }
    searchUrl.searchParams.set("country", "Sweden");
    searchUrl.searchParams.set("format", "jsonv2");
    searchUrl.searchParams.set("limit", "1");

    const requestInit = {
      method: "GET",
      headers: {
        "User-Agent": "try-sweden-ai/1.0",
      },
    } satisfies RequestInit;

    try {
      const primaryPayload = await this.fetchJson(
        searchUrl.toString(),
        requestInit,
        "Nominatim school geocode",
        8000,
      );
      const primaryResults = this.toArray(primaryPayload);
      const primaryRecord = this.toRecord(primaryResults[0]);
      if (primaryRecord) {
        const lat = Number(primaryRecord.lat);
        const lng = Number(primaryRecord.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const result = { lat, lng };
          cache.set(cacheKey, result);
          return result;
        }
      }

      const fallbackUrl = new URL("https://nominatim.openstreetmap.org/search");
      fallbackUrl.searchParams.set(
        "q",
        [streetAddress, postalCode, locality, "Sweden"]
          .filter((part) => part.length > 0)
          .join(", "),
      );
      fallbackUrl.searchParams.set("format", "jsonv2");
      fallbackUrl.searchParams.set("limit", "1");

      const fallbackPayload = await this.fetchJson(
        fallbackUrl.toString(),
        requestInit,
        "Nominatim school geocode fallback",
        8000,
      );
      const fallbackResults = this.toArray(fallbackPayload);
      const fallbackRecord = this.toRecord(fallbackResults[0]);
      if (fallbackRecord) {
        const lat = Number(fallbackRecord.lat);
        const lng = Number(fallbackRecord.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const result = { lat, lng };
          cache.set(cacheKey, result);
          return result;
        }
      }
    } catch (_error) {
      cache.set(cacheKey, null);
      return null;
    }

    cache.set(cacheKey, null);
    return null;
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  private toNonEmptyString(value: unknown): string | null {
    const normalized = this.normalizeWhitespace(String(value ?? ""));
    return normalized.length > 0 ? normalized : null;
  }

  private normalizePostalCode(value: string): string {
    const compact = value.replace(/\s+/g, "");
    if (/^\d{5}$/.test(compact)) {
      return `${compact.slice(0, 3)} ${compact.slice(3)}`;
    }

    return this.normalizeWhitespace(value);
  }

  private buildSchoolAddressText(
    streetAddress?: string | null,
    postalCode?: string | null,
    locality?: string | null,
  ): string {
    const normalizedStreet = this.toNonEmptyString(streetAddress ?? null);
    const normalizedPostalCode = postalCode ? this.normalizePostalCode(postalCode) : null;
    const normalizedLocality = this.toNonEmptyString(locality ?? null);

    return [normalizedStreet, [normalizedPostalCode, normalizedLocality].filter(Boolean).join(" ")]
      .map((part) => this.toNonEmptyString(part))
      .filter((part): part is string => part !== null)
      .join(", ");
  }

  private addSchoolWarning(
    warnings: Array<Record<string, unknown>>,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    severity: "info" | "warn" = "warn",
  ) {
    warnings.push({
      code,
      severity,
      message,
      ...(details ? { details } : {}),
    });
  }

  private dedupeSchoolWarnings(
    warnings: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const seen = new Set<string>();
    const result: Array<Record<string, unknown>> = [];

    for (const warning of warnings) {
      const code = String(warning.code ?? "");
      const message = String(warning.message ?? "");
      const details = this.toRecord(warning.details);
      const key = `${code}|${message}|${JSON.stringify(details ?? {})}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(warning);
    }

    return result;
  }

  private schoolNameQualityScore(value: string): number {
    const name = this.normalizeWhitespace(value);
    if (!name) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = 0;
    const tokens = name.split(" ").filter(Boolean);
    const upperTokenCount = tokens.filter((token) => /^[A-Z0-9-]+$/.test(token)).length;

    score += Math.min(name.length, 30) / 10;
    score += Math.min(tokens.length, 4);

    if (/[a-zåäö]/.test(name)) {
      score += 2;
    }
    if (/(skola|school|gymnasium|grundskola|förskola|campus|akademi|college)/i.test(name)) {
      score += 3;
    }
    if (/^[A-Z]{2,6}$/.test(name)) {
      score -= 5;
    }
    if (name.length <= 8) {
      score -= 2;
    }
    if (upperTokenCount === tokens.length && tokens.length > 0) {
      score -= 1.5;
    }
    if (/^(local school|school \d+|okänd|unknown)$/i.test(name)) {
      score -= 6;
    }

    return score;
  }

  private isLowQualitySchoolName(value: string): boolean {
    return this.schoolNameQualityScore(value) < 2;
  }

  private selectCanonicalSchoolName(
    detailAttributes: Record<string, unknown>,
    item: Record<string, unknown>,
    schoolUnitCode: string,
  ): {
    name: string;
    source: string;
    status: "canonical" | "fallback";
    warnings: Array<Record<string, unknown>>;
  } {
    const warnings: Array<Record<string, unknown>> = [];
    const candidates = [
      {
        value: this.toNonEmptyString(detailAttributes.displayName),
        source: "detail_attributes.displayName",
      },
      {
        value: this.toNonEmptyString(detailAttributes.schoolUnitName),
        source: "detail_attributes.schoolUnitName",
      },
      {
        value: this.toNonEmptyString(detailAttributes.name),
        source: "detail_attributes.name",
      },
      {
        value: this.toNonEmptyString(item.name),
        source: "list_item.name",
      },
      {
        value: this.toNonEmptyString(item.schoolName),
        source: "list_item.schoolName",
      },
      {
        value: this.toNonEmptyString(schoolUnitCode),
        source: "school_unit_code",
      },
    ]
      .filter((candidate): candidate is { value: string; source: string } =>
        Boolean(candidate.value),
      )
      .map((candidate) => ({
        ...candidate,
        value: this.normalizeWhitespace(candidate.value),
        quality: this.schoolNameQualityScore(candidate.value),
      }));

    const dedupedCandidates = Array.from(
      new Map(candidates.map((candidate) => [candidate.value.toLowerCase(), candidate])).values(),
    );

    const selected = dedupedCandidates[0] ?? {
      value: schoolUnitCode,
      source: "school_unit_code",
      quality: this.schoolNameQualityScore(schoolUnitCode),
    };
    const richestCandidate = dedupedCandidates.reduce(
      (best, candidate) => (candidate.quality > best.quality ? candidate : best),
      selected,
    );

    const canonical =
      selected.quality < richestCandidate.quality - 2 && this.isLowQualitySchoolName(selected.value)
        ? richestCandidate
        : selected;

    if (canonical.value !== selected.value) {
      this.addSchoolWarning(
        warnings,
        "truncated_or_low_quality_name",
        "Replaced a weaker school name with a richer canonical detail name.",
        {
          selected_name: selected.value,
          selected_source: selected.source,
          canonical_name: canonical.value,
          canonical_source: canonical.source,
        },
      );
    } else if (this.isLowQualitySchoolName(canonical.value)) {
      this.addSchoolWarning(
        warnings,
        "truncated_or_low_quality_name",
        "Canonical school name still looks abbreviated or low-information.",
        {
          canonical_name: canonical.value,
          canonical_source: canonical.source,
        },
      );
    }

    return {
      name: canonical.value,
      source: canonical.source,
      status: canonical.source === "school_unit_code" ? "fallback" : "canonical",
      warnings,
    };
  }

  private selectCanonicalSchoolAddress(detailAttributes: Record<string, unknown>): {
    address?: string;
    source?: string;
    addressType?: string;
    streetAddress?: string;
    postalCode?: string;
    locality?: string;
    explicitGeo?: { lat: number; lng: number };
    status: "canonical" | "fallback";
    warnings: Array<Record<string, unknown>>;
  } {
    const warnings: Array<Record<string, unknown>> = [];
    const addresses = this.toArray(detailAttributes.addresses)
      .map((entry) => this.toRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    const candidates = addresses
      .map((address, index) => {
        const type = this.toNonEmptyString(address.type) ?? "UNKNOWN";
        const streetAddress = this.toNonEmptyString(address.streetAddress);
        const postalCode = this.toNonEmptyString(address.postalCode);
        const locality = this.toNonEmptyString(address.locality);
        const formatted = this.buildSchoolAddressText(streetAddress, postalCode, locality);
        const explicitGeo =
          this.parseSchoolGeoCoordinates(address.geoCoordinates) ??
          this.parseSchoolGeoCoordinates(address);
        const completenessScore =
          (streetAddress ? 3 : 0) +
          (postalCode ? 1 : 0) +
          (locality ? 1 : 0) +
          (type.toUpperCase() === "BESOKSADRESS" ? 2 : 0);

        return {
          type,
          index,
          streetAddress: streetAddress ?? undefined,
          postalCode: postalCode ? this.normalizePostalCode(postalCode) : undefined,
          locality: locality ?? undefined,
          explicitGeo: explicitGeo ?? undefined,
          formatted: formatted || undefined,
          source: `detail_attributes.addresses[${index}]`,
          completenessScore,
        };
      })
      .filter((candidate) => candidate.formatted || candidate.explicitGeo);

    const selected = [...candidates].sort((left, right) => {
      if (right.completenessScore !== left.completenessScore) {
        return right.completenessScore - left.completenessScore;
      }

      return left.index - right.index;
    })[0];

    if (!selected?.formatted) {
      this.addSchoolWarning(
        warnings,
        "address_quality",
        "School detail payload does not contain a complete display address.",
      );
      return {
        status: "fallback",
        explicitGeo: selected?.explicitGeo,
        warnings,
      };
    }

    if (!selected.streetAddress) {
      this.addSchoolWarning(
        warnings,
        "address_quality",
        "Canonical school address is missing a street address.",
        {
          canonical_address: selected.formatted,
        },
      );
    }
    if (!selected.postalCode || !selected.locality) {
      this.addSchoolWarning(
        warnings,
        "address_quality",
        "Canonical school address is missing postal code or locality.",
        {
          canonical_address: selected.formatted,
        },
      );
    }

    const richerAlternative = candidates.find(
      (candidate) =>
        candidate.formatted &&
        candidate.formatted !== selected.formatted &&
        candidate.completenessScore > selected.completenessScore,
    );

    if (richerAlternative) {
      this.addSchoolWarning(
        warnings,
        "address_quality",
        "Another raw detail address is richer than the chosen canonical address.",
        {
          canonical_address: selected.formatted,
          alternative_address: richerAlternative.formatted,
        },
      );
    }

    return {
      address: selected.formatted,
      source: selected.source,
      addressType: selected.type,
      streetAddress: selected.streetAddress,
      postalCode: selected.postalCode,
      locality: selected.locality,
      explicitGeo: selected.explicitGeo,
      status: "canonical",
      warnings,
    };
  }

  private calculateDistanceMeters(
    left: { lat: number; lng: number },
    right: { lat: number; lng: number },
  ): number {
    const earthRadiusMeters = 6371000;
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const latDelta = toRadians(right.lat - left.lat);
    const lngDelta = toRadians(right.lng - left.lng);
    const leftLat = toRadians(left.lat);
    const rightLat = toRadians(right.lat);

    const a =
      Math.sin(latDelta / 2) ** 2 +
      Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private selectSchoolCoordinates(options: {
    explicitGeo?: { lat: number; lng: number } | null;
    geocodedGeo?: { lat: number; lng: number } | null;
    fallbackGeo: { lat: number; lng: number };
  }): {
    lat: number;
    lng: number;
    source: string;
    status: "canonical" | "fallback";
    warnings: Array<Record<string, unknown>>;
  } {
    const warnings: Array<Record<string, unknown>> = [];

    if (options.explicitGeo && options.geocodedGeo) {
      const distanceMeters = this.calculateDistanceMeters(options.explicitGeo, options.geocodedGeo);
      if (distanceMeters > 500) {
        this.addSchoolWarning(
          warnings,
          "coordinate_mismatch",
          "Explicit school coordinates differ materially from the geocoded address.",
          {
            explicit_coordinates: options.explicitGeo,
            geocoded_coordinates: options.geocodedGeo,
            distance_meters: Math.round(distanceMeters),
          },
        );
      }
    }

    if (options.explicitGeo) {
      return {
        lat: options.explicitGeo.lat,
        lng: options.explicitGeo.lng,
        source: "detail_attributes.addresses.geoCoordinates",
        status: "canonical",
        warnings,
      };
    }

    if (options.geocodedGeo) {
      return {
        lat: options.geocodedGeo.lat,
        lng: options.geocodedGeo.lng,
        source: "geocoded_canonical_address",
        status: "canonical",
        warnings,
      };
    }

    this.addSchoolWarning(
      warnings,
      "coordinate_fallback",
      "School coordinates fell back to the area anchor because neither detail coordinates nor geocoding were available.",
      {
        fallback_coordinates: options.fallbackGeo,
      },
    );

    return {
      lat: options.fallbackGeo.lat,
      lng: options.fallbackGeo.lng,
      source: "area_anchor_fallback",
      status: "fallback",
      warnings,
    };
  }

  private extractMunicipalityCode(
    detailAttributes: Record<string, unknown>,
    item: Record<string, unknown>,
  ): string | null {
    const detailMunicipality = this.toRecord(detailAttributes.municipality);
    const listMunicipality = this.toRecord(item.municipality);

    const candidates = [
      detailAttributes.municipalityCode,
      detailAttributes.municipality_code,
      detailMunicipality?.code,
      item.municipalityCode,
      item.municipality_code,
      listMunicipality?.code,
    ];

    for (const candidate of candidates) {
      const digits = String(candidate ?? "").replace(/\D/g, "");
      if (digits.length >= 4) {
        return digits.slice(0, 4);
      }
    }

    return null;
  }

  private extractSchoolUnitCodeFromRawData(rawData?: Record<string, unknown>): string | null {
    if (!rawData) {
      return null;
    }

    const normalized = this.toRecord(rawData.normalized);
    const detailAttributes = this.toRecord(rawData.detail_attributes);
    const listItem = this.toRecord(rawData.list_item);
    const detailPayload = this.toRecord(rawData.detail_payload);
    const detailData = this.toRecord(detailPayload?.data);
    const detailPayloadAttributes = this.toRecord(detailData?.attributes);

    const candidates = [
      normalized?.school_unit_code,
      detailAttributes?.schoolUnitCode,
      detailPayloadAttributes?.schoolUnitCode,
      listItem?.schoolUnitCode,
    ];

    for (const candidate of candidates) {
      const value = this.toNonEmptyString(candidate);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private mergeSchoolWarnings(
    rawData: Record<string, unknown> | undefined,
    warnings: Array<Record<string, unknown>>,
  ): Record<string, unknown> | undefined {
    if ((!rawData || Object.keys(rawData).length === 0) && warnings.length === 0) {
      return rawData;
    }

    const nextRawData = { ...(rawData ?? {}) };
    const existingNormalized = this.toRecord(nextRawData.normalized) ?? {};
    const existingWarnings = this.toArray(existingNormalized.warnings)
      .map((warning) => this.toRecord(warning))
      .filter((warning): warning is Record<string, unknown> => warning !== null);

    nextRawData.normalized = {
      ...existingNormalized,
      warnings: this.dedupeSchoolWarnings([...existingWarnings, ...warnings]),
    };

    return nextRawData;
  }

  private async loadPersistedSchoolWarnings(
    school: SchoolRecord,
  ): Promise<Array<Record<string, unknown>>> {
    const warnings: Array<Record<string, unknown>> = [];
    const canonicalAddress = this.toNonEmptyString(school.address);

    if (!canonicalAddress) {
      return warnings;
    }

    const currentSchoolUnitCode = this.extractSchoolUnitCodeFromRawData(school.raw_data);
    const duplicateRes = await pool.query(
      `SELECT
         name,
         district_id,
         deso_id,
         COALESCE(
           school_unit_code,
           raw_data -> 'normalized' ->> 'school_unit_code',
           raw_data -> 'detail_attributes' ->> 'schoolUnitCode',
           raw_data -> 'list_item' ->> 'schoolUnitCode'
         ) AS school_unit_code
       FROM schools
       WHERE address = $1
       LIMIT 10`,
      [canonicalAddress],
    );

    const conflictingRows = duplicateRes.rows.filter((row) => {
      const rowName = this.normalizeWhitespace(String(row.name ?? ""));
      const rowSchoolUnitCode = this.toNonEmptyString(row.school_unit_code);
      const sameSchool =
        Boolean(currentSchoolUnitCode) &&
        Boolean(rowSchoolUnitCode) &&
        currentSchoolUnitCode === rowSchoolUnitCode;
      const sameName = rowName.toLowerCase() === school.name.toLowerCase();
      return !sameSchool && !sameName;
    });

    const crossScopeRows = conflictingRows.filter((row) => {
      const rowDistrictId = this.toNonEmptyString(row.district_id);
      const rowDesoId = this.toNonEmptyString(row.deso_id);
      return (
        rowDistrictId !== (school.district_id ?? null) || rowDesoId !== (school.deso_id ?? null)
      );
    });

    if (crossScopeRows.length > 0) {
      this.addSchoolWarning(
        warnings,
        "duplicate_address",
        "Canonical school address is already used by different school names in other stored areas or districts.",
        {
          canonical_address: canonicalAddress,
          conflicting_schools: crossScopeRows.slice(0, 5).map((row) => ({
            name: String(row.name ?? ""),
            district_id: row.district_id ? String(row.district_id) : null,
            deso_id: row.deso_id ? String(row.deso_id) : null,
          })),
        },
      );
    }

    return warnings;
  }

  private async upsertSchoolRecord(school: SchoolRecord): Promise<void> {
    const scopeColumn = school.district_id ? "district_id" : "deso_id";
    const scopeValue = school.district_id ?? school.deso_id;

    if (!scopeValue) {
      throw new Error("School record is missing both district_id and deso_id");
    }

    const persistedWarnings = await this.loadPersistedSchoolWarnings(school);
    const rawData = this.mergeSchoolWarnings(school.raw_data, persistedWarnings);
    const schoolUnitCode = this.extractSchoolUnitCodeFromRawData(rawData) ?? "";
    const schoolStatus = this.toNonEmptyString(school.school_status);
    const municipalityCode = this.toNonEmptyString(school.municipality_code);
    const normalizedAddress = this.toNonEmptyString(school.address);
    const normalizedSourceLinks = JSON.stringify(
      this.dedupeSourceLinks(
        school.source_links ?? this.staticSource("Skolverket", "https://www.skolverket.se/"),
      ),
    );
    const rawDataJson = JSON.stringify(rawData ?? null);
    const schoolCodeSql = `COALESCE(
      school_unit_code,
      raw_data -> 'normalized' ->> 'school_unit_code',
      raw_data -> 'detail_attributes' ->> 'schoolUnitCode',
      raw_data -> 'list_item' ->> 'schoolUnitCode'
    )`;

    const existingRes = await pool.query(
      `SELECT id
       FROM schools
       WHERE ${scopeColumn} = $1
         AND (
           ($2 <> '' AND ${schoolCodeSql} = $2)
           OR (
             LOWER(name) = LOWER($3)
             AND COALESCE(LOWER(address), '') = COALESCE(LOWER($4), '')
           )
           OR LOWER(name) = LOWER($3)
         )
       ORDER BY
         CASE
           WHEN $2 <> '' AND ${schoolCodeSql} = $2 THEN 0
           WHEN LOWER(name) = LOWER($3)
             AND COALESCE(LOWER(address), '') = COALESCE(LOWER($4), '') THEN 1
           WHEN LOWER(name) = LOWER($3) THEN 2
           ELSE 3
         END,
         id DESC
       LIMIT 1`,
      [scopeValue, schoolUnitCode, school.name, normalizedAddress],
    );

    if (existingRes.rowCount && existingRes.rows[0]?.id) {
      await pool.query(
        `UPDATE schools
         SET
           ${scopeColumn} = $1,
           school_unit_code = NULLIF($2, ''),
           school_status = $3,
           municipality_code = $4,
           name = $5,
           address = $6,
           coordinates = ST_Point($7, $8),
           performance = $9,
           student_count = $10,
           source_links = $11::jsonb,
           raw_data = $12::jsonb
         WHERE id = $13`,
        [
          scopeValue,
          schoolUnitCode,
          schoolStatus,
          municipalityCode,
          school.name,
          normalizedAddress ?? null,
          school.lng,
          school.lat,
          school.performance,
          school.students,
          normalizedSourceLinks,
          rawDataJson,
          existingRes.rows[0].id,
        ],
      );
      return;
    }

    const conflictTarget = school.district_id ? "(district_id, name)" : "(deso_id, name)";
    await pool.query(
      `INSERT INTO schools (${scopeColumn}, school_unit_code, school_status, municipality_code, name, address, coordinates, performance, student_count, source_links, raw_data)
       VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, ST_Point($7, $8), $9, $10, $11::jsonb, $12::jsonb)
       ON CONFLICT ${conflictTarget} DO UPDATE SET
         school_unit_code = COALESCE(EXCLUDED.school_unit_code, schools.school_unit_code),
         school_status = COALESCE(EXCLUDED.school_status, schools.school_status),
         municipality_code = COALESCE(EXCLUDED.municipality_code, schools.municipality_code),
         address = EXCLUDED.address,
         coordinates = EXCLUDED.coordinates,
         performance = EXCLUDED.performance,
         student_count = EXCLUDED.student_count,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data`,
      [
        scopeValue,
        schoolUnitCode,
        schoolStatus,
        municipalityCode,
        school.name,
        normalizedAddress ?? null,
        school.lng,
        school.lat,
        school.performance,
        school.students,
        normalizedSourceLinks,
        rawDataJson,
      ],
    );
  }

  private parseMunicipalCsw(xml: string, desoId: string): MunicipalProjectRecord[] {
    const records = [...xml.matchAll(/<csw:Record[\s\S]*?<\/csw:Record>/g)];

    return records
      .map((match, index) => {
        const block = match[0];

        const id = block.match(/<dc:identifier[^>]*>([\s\S]*?)<\/dc:identifier>/i)?.[1]?.trim();
        const title = block.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.trim();
        const dcType = block.match(/<dc:type[^>]*>([\s\S]*?)<\/dc:type>/i)?.[1]?.trim();

        const uriRaw = block.match(/<dc:URI[^>]*>([\s\S]*?)<\/dc:URI>/i)?.[1]?.trim();
        const uri = uriRaw ? this.decodeXmlEntities(uriRaw) : "";

        const lower = block
          .match(/<ows:LowerCorner[^>]*>([\s\S]*?)<\/ows:LowerCorner>/i)?.[1]
          ?.trim();
        const upper = block
          .match(/<ows:UpperCorner[^>]*>([\s\S]*?)<\/ows:UpperCorner>/i)?.[1]
          ?.trim();

        const [lowerLat, lowerLng] = (lower ?? "")
          .split(/\s+/)
          .map((v) => this.toNumber(v, Number.NaN));
        const [upperLat, upperLng] = (upper ?? "")
          .split(/\s+/)
          .map((v) => this.toNumber(v, Number.NaN));

        const hasBbox =
          Number.isFinite(lowerLat) &&
          Number.isFinite(lowerLng) &&
          Number.isFinite(upperLat) &&
          Number.isFinite(upperLng);

        const lat = hasBbox ? (lowerLat + upperLat) / 2 : 59.33 + index * 0.002;
        const lng = hasBbox ? (lowerLng + upperLng) / 2 : 18.06 + index * 0.002;

        const projectType =
          dcType && dcType.length > 0
            ? dcType
            : uri.includes("MapServer")
              ? "map-service"
              : "dataset";

        return {
          external_id: id || `MUNI-${desoId}-C${index + 1}`,
          title: title || `Municipal dataset ${index + 1}`,
          project_type: projectType,
          lat,
          lng,
          status: "cataloged",
          confidence: Number(
            this.areaFactor(desoId, `project-confidence:${id ?? index}:${uri}`, 58, 93).toFixed(1),
          ),
          source_municipality: "Stockholm",
          source_links: this.dedupeSourceLinks([
            { label: "Municipal Open Data", url: "https://dataportalen.stockholm.se/" },
            ...(uri ? [{ label: "Dataset", url: uri }] : []),
          ]),
          raw_data: { xml, block },
        } satisfies MunicipalProjectRecord;
      })
      .filter((row) => row.title.length > 0)
      .slice(0, this.areaInt(desoId, "project-limit", 10, 25));
  }

  private async fetchScbDemographics(desoId: string, region: string): Promise<DemographicRecord[]> {
    const endpoint =
      process.env.SCB_API_URL ??
      "https://api.scb.se/OV0104/v1/doris/en/ssd/START/BE/BE0101/BE0101A/BefolkningNy";

    const countyCodeByRegion: Record<string, string> = {
      Stockholm: "01",
      Gothenburg: "14",
      Malmö: "12",
    };
    const regionCode = /^\d{4}$/.test(desoId) ? desoId : (countyCodeByRegion[region] ?? "01");
    const currentYear = new Date().getFullYear().toString();

    const payload = await this.fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Region", selection: { filter: "item", values: [regionCode] } },
            { code: "Civilstand", selection: { filter: "all", values: ["*"] } },
            { code: "Alder", selection: { filter: "item", values: ["tot"] } },
            { code: "Kon", selection: { filter: "all", values: ["*"] } },
            { code: "ContentsCode", selection: { filter: "item", values: ["BE0101N1"] } },
            { code: "Tid", selection: { filter: "item", values: [currentYear] } },
          ],
          response: { format: "json-stat2" },
        }),
      },
      "SCB",
    );

    const root = this.toRecord(payload);
    const data = this.toArray(root?.data);
    const parsedYear = Number.parseInt(currentYear, 10);

    const rows = data
      .map((item) => this.toRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item, index) => {
        const values = this.toArray(item.values);
        const first = this.toNumber(values[0], 17000 + index * 50);

        const profile = this.buildDemographicProfile(desoId, first);

        return {
          deso_id: desoId,
          year: parsedYear,
          population_total: first,
          population_growth: profile.population_growth,
          median_income: profile.median_income,
          higher_edu_pct: profile.higher_edu_pct,
          foreign_born_pct: profile.foreign_born_pct,
          families_with_kids_pct: profile.families_with_kids_pct,
          raw_data: { payload, item },
        } satisfies DemographicRecord;
      });

    return rows.length > 0
      ? rows
      : [
          {
            deso_id: desoId,
            year: parsedYear,
            population_total: this.areaInt(desoId, "population-fallback", 9000, 72000),
            ...this.buildDemographicProfile(
              desoId,
              this.areaInt(desoId, "population-fallback", 9000, 72000),
            ),
            raw_data: { fallback: true },
          },
        ];
  }

  private async discoverStockholmCountyMunicipalities(): Promise<StockholmMunicipalitySeed[]> {
    const endpoint =
      process.env.SCB_API_URL ??
      "https://api.scb.se/OV0104/v1/doris/en/ssd/START/BE/BE0101/BE0101A/BefolkningNy";

    const metadata = await this.fetchJson(endpoint, { method: "GET" }, "SCB metadata", 15000);
    const root = this.toRecord(metadata);
    const variables = this.toArray(root?.variables);

    const regionVariable = variables
      .map((item) => this.toRecord(item))
      .find((item) => item?.code === "Region");

    if (!regionVariable) {
      throw new Error("SCB metadata does not include Region variable");
    }

    const allowedCodes = this.stockholmCountyMunicipalityCodes();
    const values = this.toArray(regionVariable.values).map((v) => String(v));
    const valueTexts = this.toArray(regionVariable.valueTexts).map((v) => String(v));
    const municipalities: StockholmMunicipalitySeed[] = [];

    for (let i = 0; i < values.length; i += 1) {
      const code = values[i];
      const text = valueTexts[i] ?? code;
      if (!allowedCodes.has(code)) {
        continue;
      }

      municipalities.push({
        municipality_code: code,
        municipality_name: text,
      });
    }

    municipalities.sort((left, right) =>
      left.municipality_name.localeCompare(right.municipality_name, "sv"),
    );
    return municipalities;
  }

  private async discoverStockholmAreas(): Promise<StockholmAreaSeed[]> {
    const municipalities = await this.discoverStockholmCountyMunicipalities();
    const municipalityLookup = new Map(
      municipalities.map((municipality) => [
        municipality.municipality_code,
        municipality.municipality_name,
      ]),
    );
    const seeds = await discoverStockholmCountyDesoSeeds(municipalityLookup);

    return seeds.map((seed) => ({
      deso_id: seed.deso_id,
      area_name: seed.area_name,
      municipality_code: seed.municipality_code,
      municipality_name: seed.municipality_name,
    }));
  }

  private async fetchStockholmCountyDesoGeometries(
    municipalityCode: string,
  ): Promise<StockholmDesoGeometryRecord[]> {
    const url = new URL("https://geodata.scb.se/geoserver/stat/wfs");
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "1.1.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeName", "stat:DeSO_2025");
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("srsName", "EPSG:4326");
    url.searchParams.set("CQL_FILTER", `kommunkod='${municipalityCode}'`);

    const payload = await this.fetchJson(
      url.toString(),
      { method: "GET" },
      `SCB DeSO geodata ${municipalityCode}`,
      30000,
    );

    return extractStockholmCountyDesoGeometries(payload);
  }

  private async ensureStockholmCountyDistrictCoverage(): Promise<void> {
    if (!this.stockholmCountyDistrictCoveragePromise) {
      this.stockholmCountyDistrictCoveragePromise = (async () => {
        const scope = "district coverage";
        const startedAt = Date.now();
        this.logProgress(scope, "start");

        const discoverStartedAt = this.logStepStart(
          scope,
          "discover Stockholm county municipalities",
        );
        const municipalitySeeds = await this.discoverStockholmCountyMunicipalities();
        this.logStepDone(
          scope,
          "discover Stockholm county municipalities",
          discoverStartedAt,
          `found=${municipalitySeeds.length}`,
        );

        const municipalityIds = new Map<string, { id: number; name: string }>();
        const upsertStartedAt = this.logStepStart(scope, "upsert municipalities");
        for (const municipality of municipalitySeeds) {
          const municipalityRef = await this.upsertOfficialMunicipality(
            municipality.municipality_code,
            municipality.municipality_name,
            {
              source: "ingestion.stockholm_county_municipalities",
              municipality_code: municipality.municipality_code,
              municipality_name: municipality.municipality_name,
              county: "Stockholm County",
            },
          );
          municipalityIds.set(municipality.municipality_code, {
            id: municipalityRef.id,
            name: municipalityRef.name,
          });
        }
        this.logStepDone(
          scope,
          "upsert municipalities",
          upsertStartedAt,
          `upserted=${municipalityIds.size}`,
        );

        const desoDiscoverStartedAt = this.logStepStart(
          scope,
          "discover Stockholm county DeSO list",
        );
        const municipalityLookup = new Map(
          municipalitySeeds.map((municipality) => [
            municipality.municipality_code,
            municipality.municipality_name,
          ]),
        );
        const desoSeeds = await discoverStockholmCountyDesoSeeds(municipalityLookup);
        this.logStepDone(
          scope,
          "discover Stockholm county DeSO list",
          desoDiscoverStartedAt,
          `found=${desoSeeds.length}`,
        );

        const geometryStartedAt = this.logStepStart(scope, "fetch Stockholm county DeSO geometry");
        const geometryByDesoId = new Map<string, StockholmDesoGeometryRecord>();
        for (const municipality of municipalitySeeds) {
          const geometryRows = await this.fetchStockholmCountyDesoGeometries(
            municipality.municipality_code,
          );
          this.logProgress(
            scope,
            `geometry municipality=${municipality.municipality_code} features=${geometryRows.length}`,
          );
          for (const geometry of geometryRows) {
            geometryByDesoId.set(geometry.deso_id, geometry);
          }
        }
        this.logStepDone(
          scope,
          "fetch Stockholm county DeSO geometry",
          geometryStartedAt,
          `features=${geometryByDesoId.size}`,
        );

        const compatibilityStartedAt = this.logStepStart(
          scope,
          "upsert DeSO areas and compatibility districts",
        );
        let desoAreasUpserted = 0;
        let compatibilityDistrictsUpserted = 0;
        let missingGeometryCount = 0;

        for (const seed of desoSeeds) {
          const municipalityRef = municipalityIds.get(seed.municipality_code);
          if (!municipalityRef) {
            continue;
          }

          const geometry = geometryByDesoId.get(seed.deso_id);
          const geometryGeoJson = geometry ? JSON.stringify(geometry.geometry) : null;
          if (!geometryGeoJson) {
            missingGeometryCount += 1;
          }

          await this.ensureDesoArea(seed.deso_id, {
            areaName: seed.area_name,
            region: "Stockholm",
            municipalityCode: seed.municipality_code,
            municipalityName: seed.municipality_name,
            geometryGeoJson,
            geometryRawData: geometry
              ? {
                  source: "scb_open_geodata",
                  county_code: geometry.county_code,
                  municipality_code: geometry.municipality_code,
                  regso_code: geometry.regso_code,
                  geometry_version: geometry.version,
                  source_feature: geometry.raw_feature,
                }
              : { source: "scb_open_geodata", geometry_missing: true },
          });
          desoAreasUpserted += 1;

          const anchor = this.areaAnchor(seed.deso_id);
          await pool.query(
            `INSERT INTO districts (
               id,
               deso_id,
               municipality_id,
               name,
               type,
               area_km2,
               geometry,
               centroid,
               description,
               raw_data
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               'deso_compat',
               CASE
                 WHEN $5::text IS NULL THEN NULL
                 ELSE ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)::geography) / 1000000.0
               END,
               CASE
                 WHEN $5::text IS NULL THEN NULL
                 ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
               END,
               COALESCE(
                 ST_PointOnSurface(ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))),
                 ST_SetSRID(ST_MakePoint($6, $7), 4326)
               ),
               $8,
               $9::jsonb
             )
             ON CONFLICT (id) DO UPDATE SET
               deso_id = EXCLUDED.deso_id,
               municipality_id = EXCLUDED.municipality_id,
               name = EXCLUDED.name,
               type = EXCLUDED.type,
               area_km2 = COALESCE(EXCLUDED.area_km2, districts.area_km2),
               geometry = COALESCE(EXCLUDED.geometry, districts.geometry),
               centroid = COALESCE(EXCLUDED.centroid, districts.centroid),
               description = EXCLUDED.description,
               raw_data = COALESCE(districts.raw_data, '{}'::jsonb) || EXCLUDED.raw_data,
               updated_at = NOW()`,
            [
              seed.district_id,
              seed.deso_id,
              municipalityRef.id,
              seed.district_name,
              geometryGeoJson,
              anchor.lng,
              anchor.lat,
              `Compatibility district backed by official DeSO ${seed.deso_id}`,
              JSON.stringify({
                source: "ingestion.stockholm_county_deso_compat",
                canonical_deso_id: seed.deso_id,
                municipality_code: seed.municipality_code,
                municipality_name: seed.municipality_name,
                county_code: seed.county_code,
                deso_source_code: seed.source_code,
                geometry_version: geometry?.version ?? null,
              }),
            ],
          );
          compatibilityDistrictsUpserted += 1;
        }
        this.logStepDone(
          scope,
          "upsert DeSO areas and compatibility districts",
          compatibilityStartedAt,
          `deso_areas=${desoAreasUpserted}, districts=${compatibilityDistrictsUpserted}, missing_geometry=${missingGeometryCount}`,
        );

        const aliasStartedAt = this.logStepStart(scope, "sync district aliases");
        const aliasSummary = await this.syncStockholmDistrictAliases();
        this.logStepDone(
          scope,
          "sync district aliases",
          aliasStartedAt,
          `aliases=${aliasSummary.aliasesSynced}, display_names=${aliasSummary.displayNamesUpdated}`,
        );

        const namedDistrictStartedAt = this.logStepStart(scope, "sync pilot named districts");
        const namedDistrictSummary = await this.syncPilotNamedDistricts();
        this.logStepDone(
          scope,
          "sync pilot named districts",
          namedDistrictStartedAt,
          `districts=${namedDistrictSummary.districtsSynced}, official=${namedDistrictSummary.officialDistricts}, seeded=${namedDistrictSummary.seededDistricts}`,
        );

        const crosswalkStartedAt = this.logStepStart(scope, "rebuild named district crosswalk");
        const crosswalkSummary = await this.rebuildPilotNamedDistrictCrosswalk();
        this.logStepDone(
          scope,
          "rebuild named district crosswalk",
          crosswalkStartedAt,
          `districts=${crosswalkSummary.mappedDistricts}, rows=${crosswalkSummary.crosswalkRows}`,
        );

        const summaryRes = await pool.query(
          `SELECT
             COUNT(*)::int AS district_count,
             COUNT(*) FILTER (WHERE centroid IS NOT NULL)::int AS districts_with_points
           FROM districts d
           JOIN municipalities m ON m.id = d.municipality_id
           WHERE m.code = ANY($1::varchar[])
             AND d.type = 'deso_compat'`,
          [Array.from(this.stockholmCountyMunicipalityCodes())],
        );
        const summary = summaryRes.rows[0] ?? {};
        this.logProgress(
          scope,
          `complete in ${this.formatDuration(Date.now() - startedAt)}: districts=${Number(summary.district_count ?? 0)}, points=${Number(summary.districts_with_points ?? 0)}`,
        );
      })().catch((error) => {
        this.stockholmCountyDistrictCoveragePromise = null;
        throw error;
      });
    }

    await this.stockholmCountyDistrictCoveragePromise;
  }

  private async discoverDistricts(options?: {
    municipality?: string;
    limit?: number;
  }): Promise<DistrictSeed[]> {
    await this.ensureStockholmCountyDistrictCoverage();
    const params: unknown[] = [];
    const clauses: string[] = [`COALESCE(d.type, '') <> 'municipality'`];

    if (options?.municipality) {
      params.push(options.municipality);
      clauses.push(`m.name = $${params.length}`);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause =
      typeof options?.limit === "number" && options.limit > 0
        ? ` LIMIT ${Math.floor(options.limit)}`
        : "";

    const result = await pool.query(
      `SELECT
         d.id AS district_id,
         d.name AS district_name,
         m.name AS municipality_name,
         COALESCE(m.code, '0180') AS municipality_code,
         d.deso_id,
         d.type AS district_type
       FROM districts d
       JOIN municipalities m ON m.id = d.municipality_id
       ${whereClause}
       ORDER BY m.name, d.name${limitClause}`,
      params,
    );

    return result.rows.map((row) => ({
      district_id: String(row.district_id),
      district_name: String(row.district_name),
      municipality_name: String(row.municipality_name),
      municipality_code: String(row.municipality_code),
      deso_id: row.deso_id ? String(row.deso_id) : null,
      district_type: row.district_type ? String(row.district_type) : null,
    }));
  }

  private async syncCompatibilityDistrictFromDeso(
    districtId: string,
    desoId: string,
    year: number,
  ): Promise<void> {
    const scoreExistsRes = await pool.query(
      `SELECT 1
       FROM neighborhood_scores
       WHERE deso_id = $1
       LIMIT 1`,
      [desoId],
    );

    if (scoreExistsRes.rowCount === 0) {
      await this.ingestAll(desoId, "Stockholm", year, `DeSO ${desoId}`);
    }

    await pool.query(`DELETE FROM schools WHERE district_id = $1`, [districtId]);
    await pool.query(
      `INSERT INTO schools (
         district_id,
         school_unit_code,
         school_status,
         municipality_code,
         name,
         address,
         coordinates,
         performance,
         student_count,
         source_links,
         raw_data
       )
       SELECT
         $1,
         school_unit_code,
         school_status,
         municipality_code,
         name,
         address,
         coordinates,
         performance,
         student_count,
         source_links,
         COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
           'compatibility_copy',
           jsonb_build_object(
             'source', 'deso_areas',
             'deso_id', $2,
             'district_id', $1
           )
         )
       FROM schools
       WHERE deso_id = $2`,
      [districtId, desoId],
    );

    await pool.query(`DELETE FROM future_projects WHERE district_id = $1`, [districtId]);
    await pool.query(
      `INSERT INTO future_projects (
         district_id,
         title,
         project_type,
         coordinates,
         confidence,
         status,
         source_links,
         raw_data
       )
       SELECT
         $1,
         title,
         project_type,
         coordinates,
         confidence,
         status,
         source_links,
         COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
           'compatibility_copy',
           jsonb_build_object(
             'source', 'deso_areas',
             'deso_id', $2,
             'district_id', $1
           )
         )
       FROM future_projects
       WHERE deso_id = $2`,
      [districtId, desoId],
    );

    await pool.query(
      `INSERT INTO demographics (
         district_id,
         year,
         population_total,
         population_growth,
         median_income,
         higher_edu_pct,
         foreign_born_pct,
         families_with_kids_pct,
         source_links,
         raw_data
       )
       SELECT
         $1,
         year,
         population_total,
         population_growth,
         median_income,
         higher_edu_pct,
         foreign_born_pct,
         families_with_kids_pct,
         source_links,
         COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
           'compatibility_copy',
           jsonb_build_object(
             'source', 'deso_areas',
             'deso_id', $2,
             'district_id', $1
           )
         )
       FROM demographics
       WHERE deso_id = $2
       ON CONFLICT (district_id, year) DO UPDATE SET
         population_total = EXCLUDED.population_total,
         population_growth = EXCLUDED.population_growth,
         median_income = EXCLUDED.median_income,
         higher_edu_pct = EXCLUDED.higher_edu_pct,
         foreign_born_pct = EXCLUDED.foreign_born_pct,
         families_with_kids_pct = EXCLUDED.families_with_kids_pct,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data`,
      [districtId, desoId],
    );

    await pool.query(`DELETE FROM crime_stats WHERE district_id = $1`, [districtId]);
    await pool.query(
      `INSERT INTO crime_stats (
         district_id,
         year,
         crime_type,
         incident_count,
         trend,
         source_links,
         raw_data
       )
       SELECT
         $1,
         year,
         crime_type,
         incident_count,
         trend,
         source_links,
         COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
           'compatibility_copy',
           jsonb_build_object(
             'source', 'deso_areas',
             'deso_id', $2,
             'district_id', $1
           )
         )
       FROM crime_stats
       WHERE deso_id = $2`,
      [districtId, desoId],
    );

    await pool.query(
      `INSERT INTO district_scores (
         district_id,
         overall_score,
         demographics_score,
         housing_market_score,
         transport_score,
         schools_score,
         safety_score,
         green_areas_score,
         future_growth_score,
         calculated_at,
         raw_data
       )
       SELECT
         $1,
         overall_score,
         demographics_score,
         housing_market_score,
         transport_score,
         schools_score,
         safety_score,
         green_areas_score,
         future_growth_score,
         NOW(),
         COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
           'compatibility_copy',
           jsonb_build_object(
             'source', 'neighborhood_scores',
             'deso_id', $2,
             'district_id', $1
           )
         )
       FROM neighborhood_scores
       WHERE deso_id = $2
       ON CONFLICT (district_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         demographics_score = EXCLUDED.demographics_score,
         housing_market_score = EXCLUDED.housing_market_score,
         transport_score = EXCLUDED.transport_score,
         schools_score = EXCLUDED.schools_score,
         safety_score = EXCLUDED.safety_score,
         green_areas_score = EXCLUDED.green_areas_score,
         future_growth_score = EXCLUDED.future_growth_score,
         calculated_at = NOW(),
         raw_data = EXCLUDED.raw_data`,
      [districtId, desoId],
    );
  }

  private async getCompatibilityDesoIdForDistrict(districtId: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT deso_id
       FROM districts
       WHERE id = $1
         AND type = 'deso_compat'
       LIMIT 1`,
      [districtId],
    );

    return result.rows[0]?.deso_id ? String(result.rows[0].deso_id) : null;
  }

  private async fetchSkolverketSchools(
    desoIdOrDistrictId: string,
    municipalityCodeOverride?: string,
    isDistrictMode: boolean = false,
  ): Promise<SchoolRecord[]> {
    const endpoint =
      process.env.SKOLVERKET_API_URL ??
      "https://api.skolverket.se/skolenhetsregistret/v2/school-units";
    const municipalityCode =
      municipalityCodeOverride ??
      process.env.SKOLVERKET_MUNICIPALITY_CODE ??
      (desoIdOrDistrictId.length >= 4 && /^\d+$/.test(desoIdOrDistrictId.slice(0, 4))
        ? desoIdOrDistrictId.slice(0, 4)
        : "0180");
    const scope = `schools ${desoIdOrDistrictId}`;
    const cacheKey = `${endpoint}|${municipalityCode}`;
    const cachedSchools = this.municipalitySchoolCache.get(cacheKey);

    if (cachedSchools) {
      this.logProgress(scope, `cache hit: municipality=${municipalityCode}`);
    } else {
      this.logProgress(scope, `cache miss: municipality=${municipalityCode}`);
    }

    const loadSchools = async (): Promise<SchoolRecord[]> => {
      const url = new URL(endpoint);
      url.searchParams.set("municipality_code", municipalityCode);
      const listStartedAt = this.logStepStart(
        scope,
        "school list fetch",
        `municipality=${municipalityCode}`,
      );
      const payload = await this.fetchJson(url.toString(), { method: "GET" }, "Skolverket", 15000);
      const root = this.toRecord(payload);
      const data = this.toRecord(root?.data);
      const items = this.toArray(data?.attributes ?? root?.items ?? root?.results)
        .map((item) => this.toRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .filter((item) => !this.isInactiveSchoolStatus(item.status));
      this.logStepDone(scope, "school list fetch", listStartedAt, `items=${items.length}`);

      const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
      const schools: SchoolRecord[] = [];
      const batchSize = 8;
      const totalBatches = Math.max(1, Math.ceil(items.length / batchSize));

      for (let start = 0; start < items.length; start += batchSize) {
        const batch = items.slice(start, start + batchSize);
        const batchNumber = Math.floor(start / batchSize) + 1;
        const batchStartedAt = this.logStepStart(
          scope,
          `school detail batch ${batchNumber}/${totalBatches}`,
          `items=${start + 1}-${start + batch.length} of ${items.length}`,
        );
        const enrichedBatch = await Promise.all(
          batch.map(async (item, batchIndex) => {
            const index = start + batchIndex;
            const schoolUnitCode = String(item.schoolUnitCode ?? "").trim();
            if (!schoolUnitCode) {
              return null;
            }

            const detailUrl = `${endpoint}/${schoolUnitCode}`;
            const detailPayload = await this.fetchJson(
              detailUrl,
              { method: "GET" },
              "Skolverket school detail",
              15000,
            );

            const detailRoot = this.toRecord(detailPayload);
            const detailData = this.toRecord(detailRoot?.data);
            const detailAttributes = this.toRecord(detailData?.attributes);
            if (!detailAttributes || this.isInactiveSchoolStatus(detailAttributes.status)) {
              return null;
            }

            const warnings: Array<Record<string, unknown>> = [];
            const nameSelection = this.selectCanonicalSchoolName(
              detailAttributes,
              item,
              schoolUnitCode,
            );
            const addressSelection = this.selectCanonicalSchoolAddress(detailAttributes);
            warnings.push(...nameSelection.warnings, ...addressSelection.warnings);

            const geocodedGeo =
              addressSelection.streetAddress &&
              (addressSelection.postalCode || addressSelection.locality)
                ? await this.geocodeSchoolAddress(
                    addressSelection.streetAddress,
                    addressSelection.postalCode ?? "",
                    addressSelection.locality ?? "",
                    geocodeCache,
                  )
                : null;
            const coordinateSelection = this.selectSchoolCoordinates({
              explicitGeo: addressSelection.explicitGeo,
              geocodedGeo,
              fallbackGeo: this.areaAnchor(`MUNI-${municipalityCode}`),
            });
            warnings.push(...coordinateSelection.warnings);

            const detailMunicipalityCode = this.extractMunicipalityCode(detailAttributes, item);
            if (detailMunicipalityCode && detailMunicipalityCode !== municipalityCode) {
              this.addSchoolWarning(
                warnings,
                "cross_district_mismatch",
                "School detail municipality code conflicts with the municipality being ingested.",
                {
                  detail_municipality_code: detailMunicipalityCode,
                  ingested_municipality_code: municipalityCode,
                },
              );
            }

            const normalizedStatus =
              nameSelection.status === "canonical" &&
              addressSelection.status === "canonical" &&
              coordinateSelection.status === "canonical"
                ? "canonical"
                : "fallback";

            const normalized = {
              status: normalizedStatus,
              school_unit_code: schoolUnitCode,
              canonical_name: nameSelection.name,
              canonical_name_source: nameSelection.source,
              canonical_address: addressSelection.address ?? null,
              canonical_address_source: addressSelection.source ?? null,
              canonical_address_type: addressSelection.addressType ?? null,
              coordinate_source: coordinateSelection.source,
              normalized_at: new Date().toISOString(),
              warnings: this.dedupeSchoolWarnings(warnings),
            };

            return {
              school_unit_code: schoolUnitCode,
              school_status:
                this.toNonEmptyString(detailAttributes.status) ??
                this.toNonEmptyString(item.status) ??
                undefined,
              municipality_code: detailMunicipalityCode ?? municipalityCode,
              name: nameSelection.name,
              address: addressSelection.address,
              lat: coordinateSelection.lat,
              lng: coordinateSelection.lng,
              performance: this.toNumber(
                item.performance ?? item.rating,
                this.areaInt(`MUNI-${municipalityCode}`, `school-perf:${index}`, 62, 96),
              ),
              students: this.toNumber(
                item.students ?? item.studentCount,
                this.areaInt(`MUNI-${municipalityCode}`, `school-students:${index}`, 180, 1500),
              ),
              source_links: this.dedupeSourceLinks([
                { label: "Skolverket list", url: url.toString() },
                { label: "Skolverket school detail", url: detailUrl },
                ...(addressSelection.streetAddress
                  ? [
                      {
                        label: "School visiting address",
                        url: `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                          [
                            addressSelection.streetAddress,
                            addressSelection.postalCode ?? "",
                            addressSelection.locality ?? "",
                            "Sweden",
                          ]
                            .filter((part) => part.length > 0)
                            .join(", "),
                        )}&format=jsonv2&limit=1`,
                      },
                    ]
                  : []),
                ...(item.website ? [{ label: "School website", url: String(item.website) }] : []),
                ...(item.homepage ? [{ label: "School website", url: String(item.homepage) }] : []),
              ]),
              raw_data: {
                list_payload: payload,
                detail_payload: detailPayload,
                list_item: item,
                detail_attributes: detailAttributes,
                normalized,
              },
            } satisfies SchoolRecord;
          }),
        );

        for (const school of enrichedBatch) {
          if (school) {
            schools.push(school);
          }
        }

        this.logStepDone(
          scope,
          `school detail batch ${batchNumber}/${totalBatches}`,
          batchStartedAt,
          `normalized=${schools.length}`,
        );
      }

      this.logProgress(scope, `catalog ready: schools=${schools.length}`);
      return schools;
    };

    const cachedPromise =
      cachedSchools ??
      loadSchools().catch((error) => {
        this.municipalitySchoolCache.delete(cacheKey);
        throw error;
      });

    if (!cachedSchools) {
      this.municipalitySchoolCache.set(cacheKey, cachedPromise);
    }

    const schools = await cachedPromise;

    return schools.length > 0
      ? schools.map((school) => ({
          ...school,
          ...(isDistrictMode
            ? { district_id: desoIdOrDistrictId, deso_id: undefined }
            : { deso_id: desoIdOrDistrictId, district_id: undefined }),
        }))
      : [
          {
            ...(isDistrictMode
              ? { district_id: desoIdOrDistrictId }
              : { deso_id: desoIdOrDistrictId }),
            name: `Local School ${desoIdOrDistrictId}`,
            lat: this.areaAnchor(desoIdOrDistrictId).lat,
            lng: this.areaAnchor(desoIdOrDistrictId).lng,
            performance: this.areaInt(desoIdOrDistrictId, "school-fallback-perf", 62, 96),
            students: this.areaInt(desoIdOrDistrictId, "school-fallback-students", 180, 1500),
            raw_data: {
              fallback: true,
              id: desoIdOrDistrictId,
              isDistrictMode,
              normalized: {
                status: "fallback",
                canonical_name: `Local School ${desoIdOrDistrictId}`,
                canonical_name_source: "fallback",
                canonical_address: null,
                canonical_address_source: null,
                coordinate_source: "area_anchor_fallback",
                normalized_at: new Date().toISOString(),
                warnings: [
                  {
                    code: "school_fetch_fallback",
                    severity: "warn",
                    message:
                      "Fell back to a synthetic local school because no Skolverket school records could be normalized.",
                  },
                ],
              },
            },
          },
        ];
  }

  private distanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async ingestSchoolsForNamedDistrict(
    namedDistrictId: string,
    options?: { radiusMeters?: number; limit?: number },
  ) {
    const radiusMeters = Math.max(500, Math.min(15000, Number(options?.radiusMeters ?? 3500)));
    const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 60)));

    const ndRes = await pool.query(
      `SELECT
         nd.id,
         nd.name,
         nd.source_municipality_code,
         nd.legacy_district_id,
         ST_Y(nd.centroid) AS lat,
         ST_X(nd.centroid) AS lng
       FROM named_districts nd
       WHERE nd.id = $1
       LIMIT 1`,
      [namedDistrictId],
    );

    if (ndRes.rowCount === 0) {
      throw new Error(`Named district not found: ${namedDistrictId}`);
    }

    const row = ndRes.rows[0] as {
      id: string;
      name: string;
      source_municipality_code: string;
      legacy_district_id: string | null;
      lat: number | null;
      lng: number | null;
    };

    const legacyDistrictId = row.legacy_district_id ? String(row.legacy_district_id) : null;
    if (!legacyDistrictId) {
      throw new Error(`Named district is missing legacy_district_id: ${namedDistrictId}`);
    }

    const centroidLat = row.lat == null ? null : Number(row.lat);
    const centroidLng = row.lng == null ? null : Number(row.lng);
    if (centroidLat == null || centroidLng == null) {
      throw new Error(`Named district is missing centroid: ${namedDistrictId}`);
    }

    const municipalityCode = String(row.source_municipality_code ?? "").trim() || "0180";
    const fetchedSchools = await this.fetchSkolverketSchools(legacyDistrictId, municipalityCode, true);

    const deduped = new Map<string, SchoolRecord & { _distance: number }>();
    for (const school of fetchedSchools) {
      const key =
        (this.toNonEmptyString(school.school_unit_code) ?? "").trim() ||
        `${school.name.toLowerCase()}|${String(school.address ?? "").toLowerCase()}`;
      const distance = this.distanceMeters(centroidLat, centroidLng, school.lat, school.lng);
      if (distance > radiusMeters) {
        continue;
      }

      const existing = deduped.get(key);
      if (!existing || distance < existing._distance) {
        deduped.set(key, { ...school, _distance: distance });
      }
    }

    const selected = [...deduped.values()]
      .sort((a, b) => a._distance - b._distance)
      .slice(0, limit)
      .map(({ _distance: _ignored, ...school }) => school);

    await pool.query(`DELETE FROM schools WHERE district_id = $1`, [legacyDistrictId]);

    for (const school of selected) {
      await this.upsertSchoolRecord({ ...school, district_id: legacyDistrictId, deso_id: undefined });
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM schools
       WHERE district_id = $1
         AND coordinates IS NOT NULL`,
      [legacyDistrictId],
    );

    return {
      status: "ok",
      namedDistrictId,
      legacyDistrictId,
      count: Number(countRes.rows[0]?.count ?? 0),
      radiusMeters,
      municipalityCode,
      source: "skolverket-municipality-filtered-by-centroid",
    };
  }

  private async fetchTrafiklabStops(desoId: string): Promise<StopRecord[]> {
    const endpoint =
      process.env.TRAFIKLAB_API_URL ?? "https://api.resrobot.se/v2.1/location.nearbystops";
    const apiKey = process.env.TRAFIKLAB_API_KEY;
    if (!apiKey) {
      throw new Error("TRAFIKLAB_API_KEY is required for ResRobot v2.1");
    }

    const url = new URL(endpoint);
    const anchor = this.areaAnchor(desoId);
    url.searchParams.set("originCoordLat", anchor.lat.toFixed(6));
    url.searchParams.set("originCoordLong", anchor.lng.toFixed(6));
    url.searchParams.set("format", "json");
    url.searchParams.set("maxNo", "20");
    url.searchParams.set("r", "2000");
    url.searchParams.set("accessId", apiKey);

    const payload = await this.fetchJson(url.toString(), { method: "GET" }, "Trafiklab");
    const root = this.toRecord(payload);
    const locations = this.toArray(
      root?.stopLocationOrCoordLocation ?? root?.StopLocation ?? root?.stops ?? root?.items,
    );

    const stops = locations
      .map((item) => this.toRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((item, index) => {
        const stop = this.toRecord(item.StopLocation) ?? item;
        const productAtStop = this.toArray(stop.productAtStop ?? stop.products);
        return {
          id: String(stop.extId ?? `${desoId}-STOP-${index + 1}`),
          name: String(stop.name ?? `Stop ${index + 1}`),
          type: String(stop.type ?? "TRANSIT"),
          lat: this.toNumber(stop.lat, anchor.lat + index * 0.001),
          lng: this.toNumber(stop.lon ?? stop.lng, anchor.lng + index * 0.001),
          routes: this.toNumber(
            stop.routeCount ?? stop.products,
            productAtStop.length || this.areaInt(desoId, `routes:${index}`, 2, 10),
          ),
          source_links: this.staticSource("Trafiklab", url.toString()),
          raw_data: { payload, item, stop },
        } satisfies StopRecord;
      });

    return stops.length > 0
      ? stops
      : [
          {
            id: `${desoId}-STOP-1`,
            name: `Transit Hub ${desoId}`,
            type: "TRAIN",
            lat: anchor.lat,
            lng: anchor.lng,
            routes: this.areaInt(desoId, "routes-fallback", 2, 10),
            raw_data: { fallback: true },
          },
        ];
  }

  private async fetchLantmaterietProperties(desoId: string): Promise<PropertyRecord[]> {
    const endpoint =
      process.env.LANTMATERIET_API_URL ?? "https://api.lantmateriet.se/belagenhetsadress/atom/v1.2";
    const apiKey = process.env.LANTMATERIET_API_KEY;
    const url = new URL(endpoint);

    const customQuery = process.env.LANTMATERIET_QUERY;
    if (customQuery && !url.searchParams.has("q")) {
      url.searchParams.set("q", customQuery);
    }

    const headers: Record<string, string> = {
      Accept: "application/atom+xml, application/xml, application/json;q=0.9, */*;q=0.8",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
      headers["X-API-KEY"] = apiKey;
      headers.apikey = apiKey;
      headers["Ocp-Apim-Subscription-Key"] = apiKey;
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Lantmateriet request failed: ${response.status}`);
    }

    const raw = await response.text();
    let properties: PropertyRecord[] = [];

    if (raw.trim().startsWith("<")) {
      properties = this.parseLantmaterietAtom(raw, desoId);
      // Add raw_data to parsed properties
      properties = properties.map((p, idx) => ({
        ...p,
        raw_data: { source: "atom", raw, index: idx },
      }));
    } else {
      const payload = JSON.parse(raw) as unknown;
      const root = this.toRecord(payload);
      const items = this.toArray(root?.addresses ?? root?.features ?? root?.results ?? root?.items);

      properties = items
        .map((item) => this.toRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item, index) => {
          const geometry = this.toRecord(item.geometry);
          const coords = this.toArray(geometry?.coordinates);
          const anchor = this.areaAnchor(desoId);
          const lng = this.toNumber(coords[0], anchor.lng + index * 0.001);
          const lat = this.toNumber(coords[1], anchor.lat + index * 0.001);
          const normalized = this.normalizeCoordinatePair(lat, lng, anchor, index);

          return {
            property_id: String(item.property_id ?? item.id ?? `PROP-${desoId}-${index + 1}`),
            address: String(item.address ?? item.label ?? `Address ${index + 1}, ${desoId}`),
            lat: normalized.lat,
            lng: normalized.lng,
            building_year: this.toNumber(
              item.building_year ?? item.yearBuilt,
              this.areaInt(desoId, `building-json:${index}`, 1965, 2023),
            ),
            source_links: this.staticSource("Lantmäteriet", url.toString()),
            raw_data: { payload, item, url: url.toString() },
          } satisfies PropertyRecord;
        });
    }

    return properties.length > 0
      ? properties
      : [
          {
            property_id: `PROP-${desoId}-001`,
            address: `Main Street 10, ${desoId}`,
            lat: this.areaAnchor(desoId).lat,
            lng: this.areaAnchor(desoId).lng,
            building_year: this.areaInt(desoId, "building-fallback:1", 1965, 2023),
            raw_data: { fallback: true },
          },
          {
            property_id: `PROP-${desoId}-002`,
            address: `Secondary Street 30, ${desoId}`,
            lat: this.areaAnchor(desoId).lat + 0.0015,
            lng: this.areaAnchor(desoId).lng - 0.0015,
            building_year: this.areaInt(desoId, "building-fallback:2", 1965, 2023),
            raw_data: { fallback: true },
          },
        ];
  }

  private async fetchSmhiObservation(desoId: string, year: number): Promise<SmhiRecord> {
    const endpoint =
      process.env.SMHI_API_URL ??
      "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/1/station-set/all/period/latest-hour/data.json";

    const payload = await this.fetchJson(endpoint, { method: "GET" }, "SMHI");
    const root = this.toRecord(payload);

    const directValue = this.toArray(root?.value)[0];
    const directValueRecord = this.toRecord(directValue);
    const directTemp = this.toNumber(directValueRecord?.value, Number.NaN);

    const stations = this.toArray(root?.station)
      .map((item) => this.toRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null);

    const stationReadings = stations
      .map((station) => {
        const first = this.toRecord(this.toArray(station.value)[0]);
        return {
          stationKey: String(station.key ?? station.id ?? ""),
          stationName: String(station.name ?? ""),
          value: this.toNumber(first?.value, Number.NaN),
        };
      })
      .filter((reading) => Number.isFinite(reading.value));

    const avgStationTemp =
      stationReadings.length > 0
        ? stationReadings.reduce((sum, reading) => sum + reading.value, 0) / stationReadings.length
        : Number.NaN;

    const sourceStation =
      stationReadings.length > 0
        ? `${stationReadings[0].stationKey}:${stationReadings[0].stationName}`
        : String(root?.station ?? "SMHI-STHLM-01");

    const temp = Number.isFinite(directTemp)
      ? directTemp
      : Number.isFinite(avgStationTemp)
        ? avgStationTemp
        : 8.6;

    const fallback = this.fallbackSmhiObservation(desoId, year);

    return {
      deso_id: desoId,
      year,
      source_station: sourceStation,
      flood_risk: Number((fallback.flood_risk + Math.max(0, (temp - 7) * 0.45)).toFixed(2)),
      green_space_ratio: fallback.green_space_ratio,
      air_quality_index: Number(
        (fallback.air_quality_index + Math.max(0, (temp - 8) * 0.25)).toFixed(2),
      ),
      temperature_avg: temp,
      rainfall_mm: fallback.rainfall_mm,
      wind_exposure_index: fallback.wind_exposure_index,
      raw_data: { payload },
    };
  }

  private async fetchMunicipalProjects(desoId: string): Promise<MunicipalProjectRecord[]> {
    const datasetEndpoint = process.env.MUNICIPAL_PROJECTS_FEED_URL;
    const endpoint =
      process.env.MUNICIPAL_OPEN_DATA_API_URL ??
      "https://dataportalen.stockholm.se/dataportalen/srv/swe/csw?service=CSW&version=2.0.2&request=GetRecords&typeNames=csw:Record&elementSetName=full&resultType=results&maxRecords=25&constraintLanguage=CQL_TEXT&constraint_language_version=1.1.0&constraint=AnyText%20like%20'%25projekt%25'";

    let projects: MunicipalProjectRecord[] = [];

    const parseJsonProjects = (raw: string, sourceUrl?: string): MunicipalProjectRecord[] => {
      const payload = JSON.parse(raw) as unknown;
      const root = this.toRecord(payload);
      const items = this.toArray(root?.items ?? root?.results ?? root?.data);

      return items
        .map((item) => this.toRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map(
          (item, index) =>
            ({
              external_id: String(item.id ?? item.external_id ?? `MUNI-${desoId}-P${index + 1}`),
              title: String(item.title ?? `Municipal project ${index + 1}`),
              project_type: String(item.project_type ?? item.type ?? "infrastructure"),
              lat: this.toNumber(
                item.lat ?? item.latitude,
                this.areaAnchor(desoId).lat + index * 0.001,
              ),
              lng: this.toNumber(
                item.lng ?? item.longitude,
                this.areaAnchor(desoId).lng + index * 0.001,
              ),
              status: String(item.status ?? "planned"),
              confidence: this.toNumber(
                item.confidence,
                Number(this.areaFactor(desoId, `municipal-confidence:${index}`, 58, 93).toFixed(1)),
              ),
              source_municipality: String(
                item.source_municipality ?? item.municipality ?? "Stockholm",
              ),
              raw_data: { payload, item, sourceUrl },
            }) satisfies MunicipalProjectRecord,
        );
    };

    if (datasetEndpoint) {
      try {
        const datasetResponse = await fetch(datasetEndpoint, { method: "GET" });
        if (datasetResponse.ok) {
          const datasetRaw = await datasetResponse.text();
          if (datasetRaw.trim().startsWith("{") || datasetRaw.trim().startsWith("[")) {
            projects = parseJsonProjects(datasetRaw, datasetEndpoint);
          }
        }
      } catch (_error) {
        // Intentionally ignore dataset feed failures and fall back to catalog discovery.
      }
    }

    if (projects.length === 0) {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Municipal Open Data request failed: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();

      if (contentType.includes("application/json") || raw.trim().startsWith("{")) {
        projects = parseJsonProjects(raw, endpoint);
      } else if (raw.includes("<csw:GetRecordsResponse") || raw.includes("<csw:Record")) {
        projects = this.parseMunicipalCsw(raw, desoId);
      }
    }

    return projects.length > 0
      ? projects
      : [
          {
            external_id: `MUNI-${desoId}-P001`,
            title: "Kista Green Mobility Corridor",
            project_type: "infrastructure",
            lat: 59.406,
            lng: 17.944,
            status: "planned",
            confidence: 82.5,
            source_municipality: "Stockholm",
            raw_data: { fallback: true },
          },
          {
            external_id: `MUNI-${desoId}-P002`,
            title: "Family Recreation Park Upgrade",
            project_type: "public-space",
            lat: 59.4018,
            lng: 17.9498,
            status: "approved",
            confidence: 76.3,
            source_municipality: "Stockholm",
            raw_data: { fallback: true },
          },
        ];
  }

  async ingestSCB(desoId: string, region = "Stockholm") {
    if (!this.regions.includes(region)) {
      throw new Error(`Unsupported region: ${region}`);
    }

    await this.ensureDesoArea(desoId, { region });

    let demographicRecords: DemographicRecord[];
    try {
      demographicRecords = await this.fetchScbDemographics(desoId, region);
    } catch (_error) {
      const population = this.areaInt(desoId, "population-catch", 9000, 72000);
      demographicRecords = [
        {
          deso_id: desoId,
          year: 2024,
          population_total: population,
          ...this.buildDemographicProfile(desoId, population),
          source_links: this.staticSource("SCB", "https://www.scb.se/"),
          raw_data: { fallback: true, region, deso_id: desoId },
        },
      ];
    }

    for (const demo of demographicRecords) {
      await pool.query(
        `INSERT INTO demographics (deso_id, year, population_total, population_growth, 
         median_income, higher_edu_pct, foreign_born_pct, families_with_kids_pct, source_links, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
         ON CONFLICT (deso_id, year) DO UPDATE SET
           population_total = EXCLUDED.population_total,
           population_growth = EXCLUDED.population_growth,
           median_income = EXCLUDED.median_income,
           source_links = EXCLUDED.source_links,
           raw_data = EXCLUDED.raw_data`,
        [
          demo.deso_id,
          demo.year,
          demo.population_total,
          demo.population_growth,
          demo.median_income,
          demo.higher_edu_pct,
          demo.foreign_born_pct,
          demo.families_with_kids_pct,
          JSON.stringify(
            this.dedupeSourceLinks(
              demo.source_links ?? this.staticSource("SCB", "https://www.scb.se/"),
            ),
          ),
          JSON.stringify(demo.raw_data ?? null),
        ],
      );
    }

    return { status: "ok", count: demographicRecords.length, source: "scb" };
  }

  async ingestCrime(desoId: string, year = 2024) {
    await this.ensureDesoArea(desoId);

    const mockCrime = {
      deso_id: desoId,
      year,
      crime_type: "total",
      incident_count: this.areaInt(desoId, "crime-count", 160, 640),
      trend: this.areaTrend(desoId),
      source_links: this.staticSource("Brå", "https://bra.se/"),
      raw_data: { generated: true },
    };

    await pool.query(
      `INSERT INTO crime_stats (deso_id, year, crime_type, incident_count, trend, source_links, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       ON CONFLICT (deso_id, year, crime_type) DO UPDATE SET
         incident_count = EXCLUDED.incident_count,
         trend = EXCLUDED.trend,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data`,
      [
        mockCrime.deso_id,
        mockCrime.year,
        mockCrime.crime_type,
        mockCrime.incident_count,
        mockCrime.trend,
        JSON.stringify(mockCrime.source_links),
        JSON.stringify(mockCrime.raw_data ?? null),
      ],
    );

    return { status: "ok" };
  }

  async ingestTransport(desoId: string) {
    let stops: StopRecord[];
    try {
      stops = await this.fetchTrafiklabStops(desoId);
    } catch (_error) {
      const anchor = this.areaAnchor(desoId);
      stops = [
        {
          id: `${desoId}-STOP-1`,
          name: `Transit Hub ${desoId}`,
          type: "TRAIN",
          lat: anchor.lat,
          lng: anchor.lng,
          routes: this.areaInt(desoId, "transport-catch:1", 2, 10),
          source_links: this.staticSource(
            "Trafiklab",
            process.env.TRAFIKLAB_API_URL ?? "https://api.resrobot.se/v2.1/location.nearbystops",
          ),
          raw_data: { fallback: true, deso_id: desoId, ordinal: 1 },
        },
        {
          id: `${desoId}-STOP-2`,
          name: `Transit Hub ${desoId} B`,
          type: "BUS",
          lat: anchor.lat + 0.0015,
          lng: anchor.lng - 0.0015,
          routes: this.areaInt(desoId, "transport-catch:2", 1, 8),
          source_links: this.staticSource(
            "Trafiklab",
            process.env.TRAFIKLAB_API_URL ?? "https://api.resrobot.se/v2.1/location.nearbystops",
          ),
          raw_data: { fallback: true, deso_id: desoId, ordinal: 2 },
        },
      ];
    }

    for (const stop of stops) {
      await pool.query(
        `INSERT INTO transport_stops (id, name, type, coordinates, route_count, source_links, raw_data)
         VALUES ($1, $2, $3, ST_Point($4, $5), $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           route_count = EXCLUDED.route_count,
           source_links = EXCLUDED.source_links,
           raw_data = EXCLUDED.raw_data`,
        [
          stop.id,
          stop.name,
          stop.type,
          stop.lng,
          stop.lat,
          stop.routes,
          JSON.stringify(
            this.dedupeSourceLinks(
              stop.source_links ??
                this.staticSource(
                  "Trafiklab",
                  process.env.TRAFIKLAB_API_URL ??
                    "https://api.resrobot.se/v2.1/location.nearbystops",
                ),
            ),
          ),
          JSON.stringify(stop.raw_data ?? null),
        ],
      );
    }

    return { status: "ok", count: stops.length, source: "trafiklab" };
  }

  async ingestSchools(desoId: string) {
    await this.ensureDesoArea(desoId);

    let schools: SchoolRecord[];
    try {
      schools = await this.fetchSkolverketSchools(desoId);
    } catch (_error) {
      const anchor = this.areaAnchor(desoId);
      schools = [
        {
          deso_id: desoId,
          name: `Local School ${desoId}`,
          lat: anchor.lat,
          lng: anchor.lng,
          performance: this.areaInt(desoId, "school-catch-perf", 62, 96),
          students: this.areaInt(desoId, "school-catch-students", 180, 1500),
          source_links: this.staticSource("Skolverket", "https://www.skolverket.se/"),
          raw_data: { fallback: true },
        },
      ];
    }

    for (const school of schools) {
      await this.upsertSchoolRecord(school);
    }

    return { status: "ok", count: schools.length, source: "skolverket" };
  }

  async ingestLantmateriet(desoId: string) {
    await this.ensureDesoArea(desoId);

    let properties: PropertyRecord[];
    try {
      properties = await this.fetchLantmaterietProperties(desoId);
    } catch (_error) {
      const anchor = this.areaAnchor(desoId);
      properties = [
        {
          property_id: `PROP-${desoId}-001`,
          address: `Main Street 10, ${desoId}`,
          lat: anchor.lat,
          lng: anchor.lng,
          building_year: this.areaInt(desoId, "property-catch:1", 1965, 2023),
          source_links: this.staticSource(
            "Lantmäteriet",
            process.env.LANTMATERIET_API_URL ??
              "https://api.lantmateriet.se/belagenhetsadress/atom/v1.2",
          ),
          raw_data: { fallback: true, deso_id: desoId, ordinal: 1 },
        },
        {
          property_id: `PROP-${desoId}-002`,
          address: `Secondary Street 30, ${desoId}`,
          lat: anchor.lat + 0.0015,
          lng: anchor.lng - 0.0015,
          building_year: this.areaInt(desoId, "property-catch:2", 1965, 2023),
          source_links: this.staticSource(
            "Lantmäteriet",
            process.env.LANTMATERIET_API_URL ??
              "https://api.lantmateriet.se/belagenhetsadress/atom/v1.2",
          ),
          raw_data: { fallback: true, deso_id: desoId, ordinal: 2 },
        },
      ];
    }

    for (const property of properties) {
      await pool.query(
        `INSERT INTO addresses (deso_id, address_string, coordinates, property_id, building_year, source_links, raw_data)
         VALUES ($1, $2, ST_Point($3, $4), $5, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (deso_id, address_string) DO UPDATE SET
           coordinates = EXCLUDED.coordinates,
           property_id = EXCLUDED.property_id,
           building_year = EXCLUDED.building_year,
           source_links = EXCLUDED.source_links,
           raw_data = EXCLUDED.raw_data`,
        [
          desoId,
          property.address,
          property.lng,
          property.lat,
          property.property_id,
          property.building_year,
          JSON.stringify(
            this.dedupeSourceLinks(
              property.source_links ??
                this.staticSource(
                  "Lantmäteriet",
                  process.env.LANTMATERIET_API_URL ??
                    "https://api.lantmateriet.se/belagenhetsadress/atom/v1.2",
                ),
            ),
          ),
          JSON.stringify(property.raw_data ?? null),
        ],
      );

      await pool.query(
        `INSERT INTO lantmateriet_properties (property_id, deso_id, address_string, coordinates, building_year, source_links, raw_data)
         VALUES ($1, $2, $3, ST_Point($4, $5), $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (property_id) DO UPDATE SET
           address_string = EXCLUDED.address_string,
           coordinates = EXCLUDED.coordinates,
           building_year = EXCLUDED.building_year,
           source_links = EXCLUDED.source_links,
           raw_data = EXCLUDED.raw_data,
           updated_at = NOW()`,
        [
          property.property_id,
          desoId,
          property.address,
          property.lng,
          property.lat,
          property.building_year,
          JSON.stringify(
            this.dedupeSourceLinks(
              property.source_links ??
                this.staticSource(
                  "Lantmäteriet",
                  process.env.LANTMATERIET_API_URL ??
                    "https://api.lantmateriet.se/belagenhetsadress/atom/v1.2",
                ),
            ),
          ),
          JSON.stringify(property.raw_data ?? null),
        ],
      );
    }

    return { status: "ok", count: properties.length, source: "lantmateriet" };
  }

  async ingestSMHI(desoId: string, year = 2024) {
    await this.ensureDesoArea(desoId);

    let observation: SmhiRecord;
    try {
      observation = await this.fetchSmhiObservation(desoId, year);
    } catch (_error) {
      observation = {
        ...this.fallbackSmhiObservation(desoId, year),
        raw_data: { fallback: true, deso_id: desoId, year },
      };
    }

    await pool.query(
      `INSERT INTO environmental_data (deso_id, year, flood_risk, green_space_ratio, air_quality_index, temperature_avg, source_links, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT (deso_id, year) DO UPDATE SET
         flood_risk = EXCLUDED.flood_risk,
         green_space_ratio = EXCLUDED.green_space_ratio,
         air_quality_index = EXCLUDED.air_quality_index,
         temperature_avg = EXCLUDED.temperature_avg,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data`,
      [
        observation.deso_id,
        observation.year,
        observation.flood_risk,
        observation.green_space_ratio,
        observation.air_quality_index,
        observation.temperature_avg,
        JSON.stringify(
          this.dedupeSourceLinks(
            observation.source_links ?? this.staticSource("SMHI", "https://www.smhi.se/data"),
          ),
        ),
        JSON.stringify(observation.raw_data ?? null),
      ],
    );

    await pool.query(
      `INSERT INTO smhi_observations (
         deso_id, year, source_station, flood_risk, green_space_ratio, air_quality_index,
         temperature_avg, rainfall_mm, wind_exposure_index, source_links, raw_data
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
       ON CONFLICT (deso_id, year, source_station) DO UPDATE SET
         flood_risk = EXCLUDED.flood_risk,
         green_space_ratio = EXCLUDED.green_space_ratio,
         air_quality_index = EXCLUDED.air_quality_index,
         temperature_avg = EXCLUDED.temperature_avg,
         rainfall_mm = EXCLUDED.rainfall_mm,
         wind_exposure_index = EXCLUDED.wind_exposure_index,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        observation.deso_id,
        observation.year,
        observation.source_station,
        observation.flood_risk,
        observation.green_space_ratio,
        observation.air_quality_index,
        observation.temperature_avg,
        observation.rainfall_mm,
        observation.wind_exposure_index,
        JSON.stringify(
          this.dedupeSourceLinks(
            observation.source_links ?? this.staticSource("SMHI", "https://www.smhi.se/data"),
          ),
        ),
        JSON.stringify(observation.raw_data ?? null),
      ],
    );

    return { status: "ok", count: 1, source: "smhi" };
  }

  async ingestMunicipalOpenData(desoId: string) {
    await this.ensureDesoArea(desoId);

    let projects: MunicipalProjectRecord[];
    try {
      projects = await this.fetchMunicipalProjects(desoId);
    } catch (_error) {
      projects = [
        {
          external_id: `MUNI-${desoId}-P001`,
          title: "Kista Green Mobility Corridor",
          project_type: "infrastructure",
          lat: 59.406,
          lng: 17.944,
          status: "planned",
          confidence: 82.5,
          source_municipality: "Stockholm",
          raw_data: { fallback: true },
        },
        {
          external_id: `MUNI-${desoId}-P002`,
          title: "Family Recreation Park Upgrade",
          project_type: "public-space",
          lat: 59.4018,
          lng: 17.9498,
          status: "approved",
          confidence: 76.3,
          source_municipality: "Stockholm",
          raw_data: { fallback: true },
        },
      ];
    }

    for (const project of projects) {
      await pool.query(
        `INSERT INTO future_projects (deso_id, title, project_type, coordinates, confidence, status, source_links, raw_data)
         VALUES ($1, $2, $3, ST_Point($4, $5), $6, $7, $8::jsonb, $9::jsonb)
         ON CONFLICT (deso_id, title, project_type) DO UPDATE SET
           coordinates = EXCLUDED.coordinates,
           confidence = EXCLUDED.confidence,
           status = EXCLUDED.status,
           source_links = EXCLUDED.source_links,
           raw_data = EXCLUDED.raw_data`,
        [
          desoId,
          project.title,
          project.project_type || "unknown",
          project.lng,
          project.lat,
          project.confidence,
          project.status,
          JSON.stringify(
            this.dedupeSourceLinks(
              project.source_links ??
                this.staticSource(
                  "Municipal Open Data",
                  process.env.MUNICIPAL_OPEN_DATA_API_URL ?? "https://dataportalen.stockholm.se/",
                ),
            ),
          ),
          JSON.stringify(project.raw_data ?? null),
        ],
      );

      await pool.query(
        `INSERT INTO municipal_projects (
          external_id, deso_id, source_municipality, title, project_type, coordinates, status, confidence, source_links, raw_data
        ) VALUES ($1, $2, $3, $4, $5, ST_Point($6, $7), $8, $9, $10::jsonb, $11::jsonb)
        ON CONFLICT (external_id) DO UPDATE SET
          title = EXCLUDED.title,
          project_type = EXCLUDED.project_type,
          coordinates = EXCLUDED.coordinates,
          status = EXCLUDED.status,
          confidence = EXCLUDED.confidence,
          source_municipality = EXCLUDED.source_municipality,
          source_links = EXCLUDED.source_links,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()`,
        [
          project.external_id,
          desoId,
          project.source_municipality,
          project.title,
          project.project_type,
          project.lng,
          project.lat,
          project.status,
          project.confidence,
          JSON.stringify(
            this.dedupeSourceLinks(
              project.source_links ??
                this.staticSource(
                  "Municipal Open Data",
                  process.env.MUNICIPAL_OPEN_DATA_API_URL ?? "https://dataportalen.stockholm.se/",
                ),
            ),
          ),
          JSON.stringify(project.raw_data ?? null),
        ],
      );
    }

    return { status: "ok", count: projects.length, source: "municipal-open-data" };
  }

  async ingestMunicipalOpenDataForDistrict(districtId: string, municipalityName?: string) {
    const compatibilityDesoId = await this.getCompatibilityDesoIdForDistrict(districtId);
    if (compatibilityDesoId) {
      await this.syncCompatibilityDistrictFromDeso(
        districtId,
        compatibilityDesoId,
        new Date().getFullYear(),
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM future_projects
         WHERE district_id = $1`,
        [districtId],
      );
      return {
        status: "ok",
        count: Number(countRes.rows[0]?.count ?? 0),
        source: "deso-compat-future-projects",
      };
    }

    let projects: MunicipalProjectRecord[];
    try {
      projects = await this.fetchMunicipalProjects(districtId);
    } catch (_error) {
      projects = [
        {
          external_id: `MUNI-${districtId}-P001`,
          title: "District Mobility Improvement Program",
          project_type: "infrastructure",
          lat: this.areaAnchor(districtId).lat,
          lng: this.areaAnchor(districtId).lng,
          status: "planned",
          confidence: 79.1,
          source_municipality: municipalityName ?? "Stockholm",
          raw_data: { fallback: true },
        },
      ];
    }

    for (const project of projects) {
      await pool.query(
        `WITH updated AS (
           UPDATE future_projects
           SET
             coordinates = ST_Point($4, $5),
             confidence = $6,
             status = $7,
             source_links = $8::jsonb,
             raw_data = $9::jsonb
           WHERE district_id = $1
             AND title = $2
             AND project_type = $3
           RETURNING id
         )
         INSERT INTO future_projects (district_id, title, project_type, coordinates, confidence, status, source_links, raw_data)
         SELECT $1, $2, $3, ST_Point($4, $5), $6, $7, $8::jsonb, $9::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM updated)`,
        [
          districtId,
          project.title,
          project.project_type || "unknown",
          project.lng,
          project.lat,
          project.confidence,
          project.status,
          JSON.stringify(
            this.dedupeSourceLinks(
              project.source_links ??
                this.staticSource(
                  "Municipal Open Data",
                  process.env.MUNICIPAL_OPEN_DATA_API_URL ?? "https://dataportalen.stockholm.se/",
                ),
            ),
          ),
          JSON.stringify(project.raw_data ?? null),
        ],
      );
    }

    return { status: "ok", count: projects.length, source: "municipal-open-data-district" };
  }

  async ingestSchoolsForDistrict(districtId: string, municipalityCode: string) {
    const compatibilityDesoId = await this.getCompatibilityDesoIdForDistrict(districtId);
    if (compatibilityDesoId) {
      await this.syncCompatibilityDistrictFromDeso(
        districtId,
        compatibilityDesoId,
        new Date().getFullYear(),
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM schools
         WHERE district_id = $1`,
        [districtId],
      );
      return {
        status: "ok",
        count: Number(countRes.rows[0]?.count ?? 0),
        source: "deso-compat-schools",
      };
    }

    let schools: SchoolRecord[];
    try {
      schools = await this.fetchSkolverketSchools(districtId, municipalityCode, true);
    } catch (_error) {
      const anchor = this.areaAnchor(districtId);
      schools = [
        {
          district_id: districtId,
          name: `Local School ${districtId}`,
          address: `${districtId} Address 1`,
          lat: anchor.lat,
          lng: anchor.lng,
          performance: this.areaInt(districtId, "school-district-catch-perf", 62, 96),
          students: this.areaInt(districtId, "school-district-catch-students", 180, 1500),
          source_links: this.staticSource("Skolverket", "https://www.skolverket.se/"),
          raw_data: { fallback: true },
        },
      ];
    }

    for (const school of schools) {
      await this.upsertSchoolRecord({ ...school, district_id: districtId, deso_id: undefined });
    }

    return { status: "ok", count: schools.length, source: "skolverket-district" };
  }

  async calculateNeighborhoodScore(desoId: string, year = 2024) {
    await this.ensureDesoArea(desoId);

    const demographicsRes = await pool.query(
      `SELECT median_income, higher_edu_pct, families_with_kids_pct, population_growth
       FROM demographics
       WHERE deso_id = $1
       ORDER BY year DESC
       LIMIT 1`,
      [desoId],
    );

    const schoolsRes = await pool.query(
      `SELECT
         AVG(performance) AS avg_performance,
         COUNT(*) AS school_count
       FROM (
         SELECT DISTINCT ON (
           COALESCE(NULLIF(school_unit_code, ''), LOWER(name) || '|' || LOWER(COALESCE(address, '')))
         )
           performance
         FROM schools
         WHERE deso_id = $1
         ORDER BY
           COALESCE(NULLIF(school_unit_code, ''), LOWER(name) || '|' || LOWER(COALESCE(address, ''))),
           COALESCE(performance, 0) DESC,
           COALESCE(student_count, 0) DESC,
           id DESC
       ) deduped_schools`,
      [desoId],
    );

    const crimeRes = await pool.query(
      `SELECT incident_count, trend
       FROM crime_stats
       WHERE deso_id = $1
       ORDER BY year DESC
       LIMIT 1`,
      [desoId],
    );

    const environmentalRes = await pool.query(
      `SELECT green_space_ratio, flood_risk, air_quality_index, temperature_avg
       FROM environmental_data
       WHERE deso_id = $1
       ORDER BY year DESC
       LIMIT 1`,
      [desoId],
    );

    const housingRes = await pool.query(
      `SELECT COUNT(*) AS address_count, AVG(building_year) AS avg_building_year
       FROM addresses
       WHERE deso_id = $1`,
      [desoId],
    );

    const transportRes = await pool.query(
      `SELECT COUNT(*) AS stop_count, AVG(route_count) AS avg_routes
       FROM transport_stops
       WHERE id LIKE $1`,
      [`${desoId}-%`],
    );

    const growthRes = await pool.query(
      `SELECT COUNT(*) AS project_count, AVG(confidence) AS avg_confidence
       FROM future_projects
       WHERE deso_id = $1`,
      [desoId],
    );

    const demo = demographicsRes.rows[0] ?? {};
    const schools = schoolsRes.rows[0] ?? {};
    const crime = crimeRes.rows[0] ?? {};
    const env = environmentalRes.rows[0] ?? {};
    const housing = housingRes.rows[0] ?? {};
    const transport = transportRes.rows[0] ?? {};
    const growth = growthRes.rows[0] ?? {};

    const medianIncome = this.toNumber(demo.median_income, 350000);
    const higherEduPct = this.toNumber(demo.higher_edu_pct, 40);
    const familiesWithKidsPct = this.toNumber(demo.families_with_kids_pct, 30);
    const populationGrowth = this.toNumber(demo.population_growth, 0);

    const avgSchoolPerformance = this.toNumber(schools.avg_performance, 0);
    const schoolCount = this.toNumber(schools.school_count, 0);

    const incidentCount = this.toNumber(crime.incident_count, 250);
    const trend = String(crime.trend ?? "stable").toLowerCase();
    const trendAdjustment = trend === "down" ? 8 : trend === "up" ? -8 : 0;

    const greenSpaceRatio = this.toNumber(env.green_space_ratio, 20);
    const floodRisk = this.toNumber(env.flood_risk, 20);
    const airQuality = this.toNumber(env.air_quality_index, 50);
    const temperatureAvg = this.toNumber(env.temperature_avg, 8);

    const addressCount = this.toNumber(housing.address_count, 0);
    const avgBuildingYear = this.toNumber(housing.avg_building_year, 2000);

    const stopCount = this.toNumber(transport.stop_count, 0);
    const avgRoutes = this.toNumber(transport.avg_routes, 0);

    const projectCount = this.toNumber(growth.project_count, 0);
    const avgConfidence = this.toNumber(growth.avg_confidence, 60);

    const demographicsScore = this.roundScore(
      (medianIncome / 600000) * 40 + higherEduPct * 0.35 + familiesWithKidsPct * 0.25,
    );

    const schoolsScore = this.roundScore(avgSchoolPerformance + Math.min(schoolCount * 2, 10));

    const transportScore = this.roundScore(avgRoutes * 14 + Math.min(stopCount * 8, 30));

    const housingAgePenalty = Math.max(0, year - avgBuildingYear) * 1.1;
    const housingScore = this.roundScore(92 - housingAgePenalty + Math.min(addressCount * 2, 20));

    const safetyScore = this.roundScore(100 - incidentCount / 8 + trendAdjustment);

    const greenAreasScore = this.roundScore(greenSpaceRatio * 2.6);

    const environmentScore = this.roundScore(
      100 -
        floodRisk * 1.2 -
        airQuality * 0.9 +
        Math.max(0, 18 - Math.abs(temperatureAvg - 10)) * 2,
    );

    const futureGrowthScore = this.roundScore(
      Math.min(projectCount * 12, 55) + avgConfidence * 0.35 + populationGrowth * 4,
    );

    const overallScore = this.roundScore(
      demographicsScore * 0.14 +
        housingScore * 0.14 +
        transportScore * 0.14 +
        schoolsScore * 0.18 +
        safetyScore * 0.14 +
        greenAreasScore * 0.12 +
        environmentScore * 0.06 +
        futureGrowthScore * 0.08,
    );

    const rawData = {
      inputs: {
        demo,
        schools,
        crime,
        env,
        housing,
        transport,
        growth,
      },
      calculations: {
        year,
        medianIncome,
        higherEduPct,
        familiesWithKidsPct,
        populationGrowth,
        avgSchoolPerformance,
        schoolCount,
        incidentCount,
        trendAdjustment,
        greenSpaceRatio,
        floodRisk,
        airQuality,
        temperatureAvg,
        addressCount,
        avgBuildingYear,
        stopCount,
        avgRoutes,
        projectCount,
        avgConfidence,
      },
    };

    await pool.query(
      `INSERT INTO neighborhood_scores (
         deso_id,
         overall_score,
         demographics_score,
         housing_market_score,
         transport_score,
         schools_score,
         safety_score,
         green_areas_score,
         environment_score,
         future_growth_score,
         calculated_at,
         raw_data
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11::jsonb)
       ON CONFLICT (deso_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         demographics_score = EXCLUDED.demographics_score,
         housing_market_score = EXCLUDED.housing_market_score,
         transport_score = EXCLUDED.transport_score,
         schools_score = EXCLUDED.schools_score,
         safety_score = EXCLUDED.safety_score,
         green_areas_score = EXCLUDED.green_areas_score,
         environment_score = EXCLUDED.environment_score,
         future_growth_score = EXCLUDED.future_growth_score,
         calculated_at = NOW(),
         raw_data = EXCLUDED.raw_data`,
      [
        desoId,
        overallScore,
        demographicsScore,
        housingScore,
        transportScore,
        schoolsScore,
        safetyScore,
        greenAreasScore,
        environmentScore,
        futureGrowthScore,
        JSON.stringify(rawData),
      ],
    );

    return {
      status: "ok",
      deso_id: desoId,
      overall_score: overallScore,
    };
  }

  async calculateDistrictScore(districtId: string, year = 2025) {
    const compatibilityDesoId = await this.getCompatibilityDesoIdForDistrict(districtId);
    if (compatibilityDesoId) {
      await this.syncCompatibilityDistrictFromDeso(districtId, compatibilityDesoId, year);
    }

    const demographicsRes = await pool.query(
      `SELECT median_income, higher_edu_pct, families_with_kids_pct, population_growth
       FROM demographics
       WHERE district_id = $1
       ORDER BY year DESC
       LIMIT 1`,
      [districtId],
    );

    const schoolsRes = await pool.query(
      `SELECT
         AVG(performance) AS avg_performance,
         COUNT(*) AS school_count
       FROM (
         SELECT DISTINCT ON (
           COALESCE(NULLIF(school_unit_code, ''), LOWER(name) || '|' || LOWER(COALESCE(address, '')))
         )
           performance
         FROM schools
         WHERE district_id = $1
         ORDER BY
           COALESCE(NULLIF(school_unit_code, ''), LOWER(name) || '|' || LOWER(COALESCE(address, ''))),
           COALESCE(performance, 0) DESC,
           COALESCE(student_count, 0) DESC,
           id DESC
       ) deduped_schools`,
      [districtId],
    );

    const crimeRes = await pool.query(
      `SELECT incident_count, trend
       FROM crime_stats
       WHERE district_id = $1
       ORDER BY year DESC
       LIMIT 1`,
      [districtId],
    );

    const futureRes = await pool.query(
      `SELECT COUNT(*) AS project_count, AVG(confidence) AS avg_confidence
       FROM future_projects
       WHERE district_id = $1`,
      [districtId],
    );

    const demo = demographicsRes.rows[0] ?? {};
    const schools = schoolsRes.rows[0] ?? {};
    const crime = crimeRes.rows[0] ?? {};
    const future = futureRes.rows[0] ?? {};

    const medianIncome = this.toNumber(demo.median_income, 350000);
    const higherEduPct = this.toNumber(demo.higher_edu_pct, 40);
    const familiesWithKidsPct = this.toNumber(demo.families_with_kids_pct, 30);
    const populationGrowth = this.toNumber(demo.population_growth, 0);

    const avgSchoolPerformance = this.toNumber(schools.avg_performance, 0);
    const schoolCount = this.toNumber(schools.school_count, 0);

    const incidentCount = this.toNumber(crime.incident_count, 250);
    const trend = String(crime.trend ?? "stable").toLowerCase();
    const trendAdjustment = trend === "down" ? 8 : trend === "up" ? -8 : 0;

    const projectCount = this.toNumber(future.project_count, 0);
    const avgConfidence = this.toNumber(future.avg_confidence, 60);

    const demographicsScore = this.roundScore(
      (medianIncome / 600000) * 40 + higherEduPct * 0.35 + familiesWithKidsPct * 0.25,
    );
    const schoolsScore = this.roundScore(avgSchoolPerformance + Math.min(schoolCount * 2, 10));
    const transportScore = this.roundScore(80);
    const housingScore = this.roundScore(78);
    const safetyScore = this.roundScore(100 - incidentCount / 8 + trendAdjustment);
    const greenAreasScore = this.roundScore(75);
    const futureGrowthScore = this.roundScore(
      Math.min(projectCount * 12, 55) + avgConfidence * 0.35 + populationGrowth * 4,
    );

    const overallScore = this.roundScore(
      demographicsScore * 0.14 +
        housingScore * 0.14 +
        transportScore * 0.14 +
        schoolsScore * 0.18 +
        safetyScore * 0.14 +
        greenAreasScore * 0.12 +
        futureGrowthScore * 0.08,
    );

    const rawData = {
      inputs: {
        demo,
        schools,
        crime,
        future,
      },
      calculations: {
        year,
        medianIncome,
        higherEduPct,
        familiesWithKidsPct,
        populationGrowth,
        avgSchoolPerformance,
        schoolCount,
        incidentCount,
        trendAdjustment,
        projectCount,
        avgConfidence,
      },
    };

    await pool.query(
      `INSERT INTO district_scores (
         district_id,
         overall_score,
         demographics_score,
         housing_market_score,
         transport_score,
         schools_score,
         safety_score,
         green_areas_score,
         future_growth_score,
         calculated_at,
         raw_data
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10::jsonb)
       ON CONFLICT (district_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         demographics_score = EXCLUDED.demographics_score,
         housing_market_score = EXCLUDED.housing_market_score,
         transport_score = EXCLUDED.transport_score,
         schools_score = EXCLUDED.schools_score,
         safety_score = EXCLUDED.safety_score,
         green_areas_score = EXCLUDED.green_areas_score,
         future_growth_score = EXCLUDED.future_growth_score,
         calculated_at = NOW(),
         raw_data = EXCLUDED.raw_data`,
      [
        districtId,
        overallScore,
        demographicsScore,
        housingScore,
        transportScore,
        schoolsScore,
        safetyScore,
        greenAreasScore,
        futureGrowthScore,
        JSON.stringify(rawData),
      ],
    );

    return {
      status: "ok",
      district_id: districtId,
      overall_score: overallScore,
    };
  }

  async ingestDemographicsForDistrict(districtId: string, year = 2025) {
    const compatibilityDesoId = await this.getCompatibilityDesoIdForDistrict(districtId);
    if (compatibilityDesoId) {
      await this.syncCompatibilityDistrictFromDeso(districtId, compatibilityDesoId, year);
      return { status: "ok", district_id: districtId, source: "deso-compat-demographics" };
    }

    const population = this.areaInt(districtId, "district-population", 10000, 30000);

    const demographicRecord = {
      district_id: districtId,
      year,
      population_total: population,
      ...this.buildDemographicProfile(districtId, population),
      source_links: this.staticSource("District Data", "https://www.scb.se/"),
      raw_data: { type: "district-generated", districtId, year },
    };

    await pool.query(
      `INSERT INTO demographics (district_id, year, population_total, population_growth, 
         median_income, higher_edu_pct, foreign_born_pct, families_with_kids_pct, source_links, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
       ON CONFLICT (district_id, year) DO UPDATE SET
         population_total = EXCLUDED.population_total,
         population_growth = EXCLUDED.population_growth,
         median_income = EXCLUDED.median_income,
         source_links = EXCLUDED.source_links,
         raw_data = EXCLUDED.raw_data`,
      [
        demographicRecord.district_id,
        demographicRecord.year,
        demographicRecord.population_total,
        demographicRecord.population_growth,
        demographicRecord.median_income,
        demographicRecord.higher_edu_pct,
        demographicRecord.foreign_born_pct,
        demographicRecord.families_with_kids_pct,
        JSON.stringify(demographicRecord.source_links),
        JSON.stringify(demographicRecord.raw_data ?? null),
      ],
    );

    return { status: "ok", district_id: districtId };
  }

  async ingestAll(desoId = "123", region = "Stockholm", year = 2024, areaName?: string) {
    const scope = `area ${desoId}`;
    const label = areaName ? `${areaName} (${desoId})` : desoId;
    const startedAt = Date.now();
    this.logProgress(scope, `start: ${label}, region=${region}, year=${year}`);

    let stepStartedAt = this.logStepStart(scope, "ensure area", label);
    await this.ensureDesoArea(desoId, { areaName, region });
    this.logStepDone(scope, "ensure area", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "demographics", region);
    await this.ingestSCB(desoId, region);
    this.logStepDone(scope, "demographics", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "crime", `year=${year}`);
    await this.ingestCrime(desoId, year);
    this.logStepDone(scope, "crime", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "transport");
    await this.ingestTransport(desoId);
    this.logStepDone(scope, "transport", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "schools");
    await this.ingestSchools(desoId);
    this.logStepDone(scope, "schools", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "properties");
    await this.ingestLantmateriet(desoId);
    this.logStepDone(scope, "properties", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "environment", `year=${year}`);
    await this.ingestSMHI(desoId, year);
    this.logStepDone(scope, "environment", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "future projects");
    await this.ingestMunicipalOpenData(desoId);
    this.logStepDone(scope, "future projects", stepStartedAt);

    stepStartedAt = this.logStepStart(scope, "score", `year=${year}`);
    const scoreResult = await this.calculateNeighborhoodScore(desoId, year);
    this.logStepDone(scope, "score", stepStartedAt, `overall=${scoreResult.overall_score}`);
    this.logProgress(scope, `complete in ${this.formatDuration(Date.now() - startedAt)}`);
    return { status: "complete", deso_id: desoId, region, year, score: scoreResult };
  }

  async ingestAllStockholmAreas(options?: { year?: number; limit?: number }) {
    const year = options?.year ?? 2024;
    const limit = options?.limit;
    const scope = "areas";

    const coverageStartedAt = this.logStepStart(scope, "ensure DeSO-backed county coverage");
    await this.ensureStockholmCountyDistrictCoverage();
    this.logStepDone(scope, "ensure DeSO-backed county coverage", coverageStartedAt);

    const discoverStartedAt = this.logStepStart(scope, "discover areas", `year=${year}`);
    const seeds = await this.discoverStockholmAreas();
    this.logStepDone(scope, "discover areas", discoverStartedAt, `found=${seeds.length}`);
    const selectedSeeds = typeof limit === "number" ? seeds.slice(0, limit) : seeds;
    this.logProgress(
      scope,
      `processing ${selectedSeeds.length} area(s)${typeof limit === "number" ? ` (limit=${limit})` : ""}`,
    );

    const results: Array<{
      deso_id: string;
      area_name: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < selectedSeeds.length; i += 1) {
      const area = selectedSeeds[i];
      const itemScope = `areas ${i + 1}/${selectedSeeds.length}`;
      const itemStartedAt = Date.now();
      this.logProgress(itemScope, `start ${area.area_name} (${area.deso_id})`);
      try {
        await this.ensureDesoArea(area.deso_id, {
          areaName: area.area_name,
          region: "Stockholm",
          municipalityCode: area.municipality_code,
          municipalityName: area.municipality_name,
        });
        await this.ingestAll(area.deso_id, "Stockholm", year, area.area_name);
        results.push({ deso_id: area.deso_id, area_name: area.area_name, ok: true });
        this.logProgress(itemScope, `done in ${this.formatDuration(Date.now() - itemStartedAt)}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          deso_id: area.deso_id,
          area_name: area.area_name,
          ok: false,
          error: errorMessage,
        });
        this.logProgress(
          itemScope,
          `failed in ${this.formatDuration(Date.now() - itemStartedAt)}: ${errorMessage}`,
        );
      }
    }

    return {
      status: "complete",
      region: "Stockholm",
      requested: selectedSeeds.length,
      ingested: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async ingestFutureProjectsForAllDistricts(options?: { municipality?: string; limit?: number }) {
    const scope = "district projects";
    const discoverStartedAt = this.logStepStart(
      scope,
      "discover districts",
      options?.municipality ? `municipality=${options.municipality}` : "all municipalities",
    );
    const seeds = await this.discoverDistricts(options);
    this.logStepDone(scope, "discover districts", discoverStartedAt, `found=${seeds.length}`);

    const results: Array<{
      district_id: string;
      district_name: string;
      municipality_name: string;
      ok: boolean;
      count?: number;
      error?: string;
    }> = [];

    for (let i = 0; i < seeds.length; i += 1) {
      const district = seeds[i];
      const itemScope = `district projects ${i + 1}/${seeds.length}`;
      const itemStartedAt = Date.now();
      this.logProgress(itemScope, `start ${district.district_name} (${district.district_id})`);
      try {
        const result = await this.ingestMunicipalOpenDataForDistrict(
          district.district_id,
          district.municipality_name,
        );
        results.push({
          district_id: district.district_id,
          district_name: district.district_name,
          municipality_name: district.municipality_name,
          ok: true,
          count: result.count,
        });
        this.logProgress(
          itemScope,
          `done in ${this.formatDuration(Date.now() - itemStartedAt)}: projects=${result.count}`,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          district_id: district.district_id,
          district_name: district.district_name,
          municipality_name: district.municipality_name,
          ok: false,
          error: errorMessage,
        });
        this.logProgress(
          itemScope,
          `failed in ${this.formatDuration(Date.now() - itemStartedAt)}: ${errorMessage}`,
        );
      }
    }

    return {
      status: "complete",
      scope: options?.municipality ? `municipality:${options.municipality}` : "all-districts",
      requested: seeds.length,
      ingested: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      total_projects_written: results.reduce((sum, row) => sum + (row.count ?? 0), 0),
      results,
    };
  }

  async ingestAllDistricts(options?: { municipality?: string; limit?: number; year?: number }) {
    const scope = "districts";
    const discoverStartedAt = this.logStepStart(
      scope,
      "discover districts",
      options?.municipality ? `municipality=${options.municipality}` : "all municipalities",
    );
    const seeds = await this.discoverDistricts(options);
    this.logStepDone(scope, "discover districts", discoverStartedAt, `found=${seeds.length}`);
    const year = options?.year ?? 2025;
    this.logProgress(scope, `processing ${seeds.length} district(s), year=${year}`);

    const results: Array<{
      district_id: string;
      district_name: string;
      municipality_name: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < seeds.length; i++) {
      const district = seeds[i];
      const itemScope = `districts ${i + 1}/${seeds.length}`;
      const itemStartedAt = Date.now();
      this.logProgress(itemScope, `start ${district.district_name} (${district.district_id})`);
      try {
        let stepStartedAt = this.logStepStart(itemScope, "seed metadata");
        await pool.query(
          `UPDATE districts
           SET raw_data = $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [
            district.district_id,
            JSON.stringify({
              source: "ingestion.discoverDistricts",
              district_id: district.district_id,
              district_name: district.district_name,
              municipality_name: district.municipality_name,
              municipality_code: district.municipality_code,
            }),
          ],
        );
        this.logStepDone(itemScope, "seed metadata", stepStartedAt);

        stepStartedAt = this.logStepStart(itemScope, "demographics", `year=${year}`);
        await this.ingestDemographicsForDistrict(district.district_id, year);
        this.logStepDone(itemScope, "demographics", stepStartedAt);

        stepStartedAt = this.logStepStart(itemScope, "schools");
        await this.ingestSchoolsForDistrict(district.district_id, district.municipality_code);
        this.logStepDone(itemScope, "schools", stepStartedAt);

        stepStartedAt = this.logStepStart(itemScope, "future projects");
        await this.ingestMunicipalOpenDataForDistrict(
          district.district_id,
          district.municipality_name,
        );
        this.logStepDone(itemScope, "future projects", stepStartedAt);

        stepStartedAt = this.logStepStart(itemScope, "score", `year=${year}`);
        await this.calculateDistrictScore(district.district_id, year);
        this.logStepDone(itemScope, "score", stepStartedAt);
        results.push({
          district_id: district.district_id,
          district_name: district.district_name,
          municipality_name: district.municipality_name,
          ok: true,
        });
        this.logProgress(itemScope, `done in ${this.formatDuration(Date.now() - itemStartedAt)}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${itemScope}] failed:`, error);
        results.push({
          district_id: district.district_id,
          district_name: district.district_name,
          municipality_name: district.municipality_name,
          ok: false,
          error: errorMessage,
        });
        this.logProgress(
          itemScope,
          `failed in ${this.formatDuration(Date.now() - itemStartedAt)}: ${errorMessage}`,
        );
      }
    }

    return {
      status: "complete",
      scope: options?.municipality ? `municipality:${options.municipality}` : "all-districts",
      requested: seeds.length,
      ingested: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async ingestSchoolsForAllDistricts(options?: { municipality?: string; limit?: number }) {
    const scope = "district schools";
    const discoverStartedAt = this.logStepStart(
      scope,
      "discover districts",
      options?.municipality ? `municipality=${options.municipality}` : "all municipalities",
    );
    const seeds = await this.discoverDistricts(options);
    this.logStepDone(scope, "discover districts", discoverStartedAt, `found=${seeds.length}`);

    // Load real centroid coordinates for every district from the database
    const centroidsStartedAt = this.logStepStart(scope, "load district centroids");
    const centroidRes = await pool.query(
      `SELECT id, ST_Y(centroid) AS lat, ST_X(centroid) AS lng FROM districts WHERE centroid IS NOT NULL`,
    );
    this.logStepDone(
      scope,
      "load district centroids",
      centroidsStartedAt,
      `found=${centroidRes.rowCount}`,
    );
    const districtCentroids = new Map<string, { lat: number; lng: number }>();
    for (const row of centroidRes.rows) {
      districtCentroids.set(row.id, { lat: Number(row.lat), lng: Number(row.lng) });
    }

    const groups = new Map<string, DistrictSeed[]>();
    for (const seed of seeds) {
      const key = `${seed.municipality_code}:${seed.municipality_name}`;
      const existing = groups.get(key) ?? [];
      existing.push(seed);
      groups.set(key, existing);
    }

    const results: Array<{
      district_id: string;
      district_name: string;
      municipality_name: string;
      ok: boolean;
      count?: number;
      error?: string;
    }> = [];

    for (const [groupKey, districtsInMunicipality] of groups) {
      const [municipalityCode, _municipalityName] = groupKey.split(":");
      const districtIds = districtsInMunicipality.map((district) => district.district_id);
      const groupScope = `district schools municipality ${municipalityCode}`;
      const groupStartedAt = Date.now();
      this.logProgress(groupScope, `start: districts=${districtsInMunicipality.length}`);

      let municipalSchools: SchoolRecord[] = [];
      try {
        const fetchStartedAt = this.logStepStart(groupScope, "fetch municipal schools");
        const fetched = await this.fetchSkolverketSchools(
          `MUNI-${municipalityCode}`,
          municipalityCode,
        );
        this.logStepDone(
          groupScope,
          "fetch municipal schools",
          fetchStartedAt,
          `fetched=${fetched.length}`,
        );
        municipalSchools = fetched.filter((school) => {
          const normalizedName = school.name.toLowerCase();
          return (
            !normalizedName.startsWith("local school") &&
            !/^school\s+\d+$/i.test(normalizedName) &&
            school.name.trim().length > 0
          );
        });
        this.logProgress(groupScope, `usable schools=${municipalSchools.length}`);
      } catch (_error) {
        municipalSchools = [];
        this.logProgress(
          groupScope,
          "fetch municipal schools failed, using fallbacks where needed",
        );
      }

      const clearStartedAt = this.logStepStart(groupScope, "clear existing district schools");
      await pool.query(`DELETE FROM schools WHERE district_id = ANY($1::varchar[])`, [districtIds]);
      this.logStepDone(
        groupScope,
        "clear existing district schools",
        clearStartedAt,
        `districts=${districtIds.length}`,
      );

      const schoolsByDistrict = new Map<
        string,
        Array<{ school: SchoolRecord; distance: number }>
      >();
      for (const district of districtsInMunicipality) {
        schoolsByDistrict.set(district.district_id, []);
      }

      for (const school of municipalSchools) {
        let nearestDistrictId: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const district of districtsInMunicipality) {
          const anchor =
            districtCentroids.get(district.district_id) ?? this.areaAnchor(district.district_id);
          const latDiff = school.lat - anchor.lat;
          const lngDiff = school.lng - anchor.lng;
          const distance = latDiff * latDiff + lngDiff * lngDiff;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestDistrictId = district.district_id;
          }
        }

        if (nearestDistrictId) {
          schoolsByDistrict.get(nearestDistrictId)?.push({ school, distance: nearestDistance });
        }
      }

      for (const district of districtsInMunicipality) {
        try {
          const districtScope = `district schools ${district.district_id}`;
          const districtStartedAt = Date.now();
          const anchor =
            districtCentroids.get(district.district_id) ?? this.areaAnchor(district.district_id);
          const assignedSchools = (schoolsByDistrict.get(district.district_id) ?? [])
            .sort((left, right) => left.distance - right.distance)
            .map((entry) => entry.school);

          const uniqueAssignedSchools = Array.from(
            new Map(assignedSchools.map((school) => [school.name.toLowerCase(), school])).values(),
          );

          const districtSchools =
            uniqueAssignedSchools.length > 0
              ? uniqueAssignedSchools.slice(0, 8)
              : [
                  {
                    deso_id: district.district_id,
                    name: `${district.district_name} Grundskola`,
                    lat: anchor.lat,
                    lng: anchor.lng,
                    performance: this.areaInt(
                      district.district_id,
                      "fallback-school-perf:1",
                      72,
                      96,
                    ),
                    students: this.areaInt(
                      district.district_id,
                      "fallback-school-students:1",
                      280,
                      1200,
                    ),
                    source_links: [
                      { label: "Municipality schools registry", url: "https://www.skolverket.se" },
                    ],
                    raw_data: { fallback: true, district_id: district.district_id, ordinal: 1 },
                  },
                  {
                    deso_id: district.district_id,
                    name: `${district.district_name} Internationella Skola`,
                    lat: anchor.lat + 0.003,
                    lng: anchor.lng - 0.003,
                    performance: this.areaInt(
                      district.district_id,
                      "fallback-school-perf:2",
                      75,
                      95,
                    ),
                    students: this.areaInt(
                      district.district_id,
                      "fallback-school-students:2",
                      250,
                      950,
                    ),
                    source_links: [
                      { label: "Municipality schools registry", url: "https://www.skolverket.se" },
                    ],
                    raw_data: { fallback: true, district_id: district.district_id, ordinal: 2 },
                  },
                  {
                    deso_id: district.district_id,
                    name: `${district.district_name} Friskola`,
                    lat: anchor.lat - 0.002,
                    lng: anchor.lng + 0.002,
                    performance: this.areaInt(
                      district.district_id,
                      "fallback-school-perf:3",
                      70,
                      92,
                    ),
                    students: this.areaInt(
                      district.district_id,
                      "fallback-school-students:3",
                      180,
                      800,
                    ),
                    source_links: [
                      { label: "Municipality schools registry", url: "https://www.skolverket.se" },
                    ],
                    raw_data: { fallback: true, district_id: district.district_id, ordinal: 3 },
                  },
                ];

          for (const school of districtSchools) {
            await this.upsertSchoolRecord({
              ...school,
              district_id: district.district_id,
              deso_id: undefined,
            });
          }

          this.logProgress(
            districtScope,
            `done in ${this.formatDuration(Date.now() - districtStartedAt)}: schools=${districtSchools.length}`,
          );

          results.push({
            district_id: district.district_id,
            district_name: district.district_name,
            municipality_name: district.municipality_name,
            ok: true,
            count: districtSchools.length,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            district_id: district.district_id,
            district_name: district.district_name,
            municipality_name: district.municipality_name,
            ok: false,
            error: errorMessage,
          });
          this.logProgress(`district schools ${district.district_id}`, `failed: ${errorMessage}`);
        }
      }

      this.logProgress(groupScope, `done in ${this.formatDuration(Date.now() - groupStartedAt)}`);
    }

    return {
      status: "complete",
      scope: options?.municipality ? `municipality:${options.municipality}` : "all-districts",
      requested: seeds.length,
      ingested: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      total_schools_written: results.reduce((sum, row) => sum + (row.count ?? 0), 0),
      results,
    };
  }
}

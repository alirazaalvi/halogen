import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { pool } from "../../db/connection";
import {
  desoAreas,
  districtScores,
  districts,
  municipalities,
  neighborhoodScores,
} from "../../db/schema";
import { publicScores, toNumeric } from "../../lib/api/area-scores";
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { latestDemographicsSql } from "../../lib/api/demographics-sql";
import { parseOrReply } from "../../lib/api/validation";
import { getPrimaryDistrictAliasMap } from "../../lib/district-aliases";
import type { RouteApp } from "../../lib/http/route-app";
import { buildNamedDistrictSchoolResolutionQuery } from "./named-district-school-resolution";

function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDistanceKm(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(Number(meters))) {
    return "-";
  }

  const value = Number(meters) / 1000;
  return `${value < 1 ? value.toFixed(1) : Math.round(value)} km`;
}

type SourceLink = {
  label: string;
  url: string;
};

function parseSourceLinks(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: SourceLink[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const label = String((item as { label?: unknown }).label ?? "").trim();
    const url = String((item as { url?: unknown }).url ?? "").trim();
    if (!label || !url) {
      continue;
    }

    const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({ label, url });
  }

  return links;
}

type AreaType = "namedDistrict" | "district" | "deso";

async function getAreaDetails(areaId: string): Promise<{
  area: {
    id: string;
    name: string | null;
    municipality: string | null;
    population: number | null;
    type: string;
    lat: number | null;
    lng: number | null;
    sourceType: string | null;
    legacyDistrictId: string | null;
  };
  areaType: AreaType;
} | null> {
  const namedDistrictResult = await pool.query(
    `SELECT
       nd.id,
       nd.name,
       m.name AS municipality,
       NULL::int AS population,
       'district' AS type,
       nd.source_type AS "sourceType",
       nd.legacy_district_id AS "legacyDistrictId",
       ST_Y(nd.centroid) AS lat,
       ST_X(nd.centroid) AS lng
     FROM named_districts nd
     LEFT JOIN municipalities m ON m.id = nd.municipality_id
     WHERE nd.id = $1
     LIMIT 1`,
    [areaId],
  );

  if (namedDistrictResult.rows.length > 0) {
    const row = namedDistrictResult.rows[0];
    return {
      area: {
        id: String(row.id),
        name: row.name ? String(row.name) : null,
        municipality: row.municipality ? String(row.municipality) : null,
        population: row.population == null ? null : Number(row.population),
        type: String(row.type),
        sourceType: row.sourceType ? String(row.sourceType) : null,
        legacyDistrictId: row.legacyDistrictId ? String(row.legacyDistrictId) : null,
        lat: row.lat == null ? null : Number(row.lat),
        lng: row.lng == null ? null : Number(row.lng),
      },
      areaType: "namedDistrict",
    };
  }

  // Try to find as district first (priority for Stockholm neighborhoods)
  const districtResult = await db
    .select({
      id: districts.id,
      name: districts.name,
      municipality: municipalities.name,
      population: districts.population,
      type: sql<string>`'district'`,
      lat: sql<number | null>`ST_Y(${districts.centroid})`,
      lng: sql<number | null>`ST_X(${districts.centroid})`,
    })
    .from(districts)
    .leftJoin(municipalities, eq(districts.municipalityId, municipalities.id))
    .where(eq(districts.id, areaId))
    .limit(1);

  if (districtResult.length > 0) {
    const aliasMap = await getPrimaryDistrictAliasMap([areaId]);
    return {
      area: {
        ...districtResult[0],
        name: aliasMap.get(areaId) ?? districtResult[0].name,
        sourceType: null,
        legacyDistrictId: null,
      },
      areaType: "district",
    };
  }

  // Fallback to DESO area
  const desoResult = await db
    .select({
      id: desoAreas.id,
      name: desoAreas.name,
      municipality: municipalities.name,
      population: desoAreas.population,
      type: sql<string>`'deso'`,
      lat: sql<number | null>`ST_Y(${desoAreas.centroid})`,
      lng: sql<number | null>`ST_X(${desoAreas.centroid})`,
    })
    .from(desoAreas)
    .leftJoin(municipalities, eq(desoAreas.municipalityId, municipalities.id))
    .where(eq(desoAreas.id, areaId))
    .limit(1);

  if (desoResult.length > 0) {
    return {
      area: {
        ...desoResult[0],
        sourceType: null,
        legacyDistrictId: null,
      },
      areaType: "deso",
    };
  }

  return null;
}

async function getScores(areaId: string, areaType: AreaType) {
  if (areaType === "namedDistrict") {
    const result = await pool.query(
      `SELECT
         SUM(ns.overall_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.overall_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "overallScore",
         SUM(ns.demographics_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.demographics_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "demographicsScore",
         SUM(ns.housing_market_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.housing_market_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "housingMarketScore",
         SUM(ns.transport_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.transport_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "transportScore",
         SUM(ns.schools_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.schools_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "schoolsScore",
         SUM(ns.safety_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.safety_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "safetyScore",
         SUM(ns.green_areas_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.green_areas_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "greenAreasScore",
         SUM(ns.future_growth_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.future_growth_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "futureGrowthScore",
         SUM(ns.data_coverage * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.data_coverage IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS "dataCoverage"
       FROM named_district_deso_map ndm
       JOIN neighborhood_scores ns ON ns.deso_id = ndm.deso_id
       WHERE ndm.district_id = $1`,
      [areaId],
    );
    return result.rows[0] || {};
  }

  if (areaType === "district") {
    const result = await db
      .select()
      .from(districtScores)
      .where(eq(districtScores.districtId, areaId))
      .limit(1);
    return result[0] || {};
  } else {
    const result = await db
      .select()
      .from(neighborhoodScores)
      .where(eq(neighborhoodScores.desoId, areaId))
      .limit(1);
    return result[0] || {};
  }
}

function scorePayload(type: "district" | "deso", scores: Record<string, unknown>) {
  const view = publicScores(scores);
  return {
    type,
    score: view.overall,
    transport: view.transport,
    schools: view.schools,
    safety: view.safety,
    housing: view.housing,
    green: view.green,
    growth: view.growth,
    coverage: view.coverage,
    missing: view.missing,
    scoringVersion: view.scoringVersion,
    overallPercentile: view.overallPercentile,
  };
}

export async function neighborhoodRoutes(fastify: RouteApp, _options: object) {
  fastify.get("/featured-neighborhoods", async (request, reply) => {
    const query = parseOrReply(
      z
        .object({
          region: z.string().min(1).default("Stockholm"),
          limit: z.coerce.number().int().min(1).max(200).default(10),
        })
        .default({}),
      request.query,
      reply,
    );
    if (!query) {
      return;
    }

    const limit = query.limit ?? 100;

    const namedDistrictRows = await pool.query(
      `SELECT
         nd.id,
         nd.name,
         m.name AS municipality,
         SUM(ns.overall_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.overall_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS overall,
         SUM(ns.schools_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.schools_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS schools,
         SUM(ns.transport_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.transport_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS transport,
         SUM(ns.green_areas_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.green_areas_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS green
       FROM named_districts nd
       LEFT JOIN municipalities m ON m.id = nd.municipality_id
       LEFT JOIN named_district_deso_map ndm ON ndm.district_id = nd.id
       LEFT JOIN neighborhood_scores ns ON ns.deso_id = ndm.deso_id
       GROUP BY nd.id, nd.name, m.name
       ORDER BY overall DESC NULLS LAST, nd.name ASC
       LIMIT $1`,
      [limit],
    );

    let results = namedDistrictRows.rows.map((row) => ({
      slug: toSlug(String(row.name ?? row.id)),
      id: String(row.id),
      type: "district",
      name: String(row.name ?? row.id),
      region: row.municipality ? String(row.municipality) : "Unknown",
      overall: row.overall,
      schools: row.schools,
      commute: row.transport,
      green: row.green,
    }));

    if (results.length === 0) {
      const allDistrics = await db
        .select({
          id: districts.id,
          name: districts.name,
          municipality: municipalities.name,
          overall: districtScores.overallScore,
          schools: districtScores.schoolsScore,
          transport: districtScores.transportScore,
          green: districtScores.greenAreasScore,
          type: sql<string>`'district'`,
        })
        .from(districts)
        .innerJoin(districtScores, eq(districtScores.districtId, districts.id))
        .leftJoin(municipalities, eq(districts.municipalityId, municipalities.id))
        .where(sql`COALESCE(${districts.type}, '') <> 'municipality'`)
        .orderBy(desc(districtScores.overallScore))
        .limit(limit);

      const aliasMap = await getPrimaryDistrictAliasMap(allDistrics.map((row) => row.id));

      results = allDistrics.map((row) => ({
        slug: toSlug(aliasMap.get(row.id) ?? row.name ?? row.id),
        id: row.id,
        type: row.type,
        name: aliasMap.get(row.id) ?? row.name ?? row.id,
        region: row.municipality ?? "Unknown",
        overall: row.overall,
        schools: row.schools,
        commute: row.transport,
        green: row.green,
      }));
    }

    return sendApiSuccess(reply, {
      results,
    });
  });

  fastify.get("/neighborhood/:deso_id", async (request, reply) => {
    const params = parseOrReply(z.object({ deso_id: z.string().min(1) }), request.params, reply);
    if (!params) {
      return;
    }

    const { deso_id } = params;

    const areaData = await getAreaDetails(deso_id);
    if (!areaData) {
      return sendApiError(reply, 404, "NOT_FOUND", "Area not found");
    }

    const { area, areaType } = areaData;

    const scores = await getScores(deso_id, areaType);

    const areaLng = Number(area.lng ?? 0);
    const areaLat = Number(area.lat ?? 0);

    // Radius for school proximity search: larger for districts (city-wide areas), smaller for deso
    const isDistrict = areaType !== "deso";
    const schoolRadiusMeters = isDistrict ? 5000 : 2000;
    const schoolRadiusDegrees = schoolRadiusMeters / 111_320;
    const namedDistrictSchoolQuery =
      areaType === "namedDistrict"
        ? buildNamedDistrictSchoolResolutionQuery({
            districtId: deso_id,
            legacyDistrictId: area.legacyDistrictId,
            geometryBufferMeters: 150,
            districtRadiusMeters: Math.min(schoolRadiusMeters, 4000),
            limit: 8,
          })
        : null;

    const schoolsRes = await pool.query(
      areaType === "namedDistrict"
        ? (namedDistrictSchoolQuery?.text ??
            "SELECT NULL::text AS name, '' AS address, NULL::int AS student_count, NULL::numeric AS performance, NULL::double precision AS lat, NULL::double precision AS lng, '[]'::jsonb AS source_links, NULL::double precision AS distance_meters WHERE FALSE")
        : isDistrict
          ? `WITH ranked_schools AS (
             SELECT DISTINCT ON (school_identity)
               s.name,
               COALESCE(s.address, '') AS address,
               s.student_count AS student_count,
               s.performance AS performance,
               ST_Y(s.coordinates) AS lat,
               ST_X(s.coordinates) AS lng,
               COALESCE(s.source_links, '[]'::jsonb) AS source_links,
               ST_Distance(
                 s.coordinates::geography,
                 COALESCE(d.geometry, d.centroid)::geography
               ) AS distance_meters,
               school_identity
             FROM (
               SELECT
                 s.*,
                 COALESCE(
                   NULLIF(s.school_unit_code, ''),
                   LOWER(s.name) || '|' || LOWER(COALESCE(s.address, ''))
                 ) AS school_identity
               FROM schools s
               WHERE s.quality IN ('measured', 'derived')
             ) s
             JOIN districts d ON d.id = $1
             WHERE s.coordinates IS NOT NULL
               AND s.coordinates && ST_Expand(COALESCE(d.geometry, d.centroid), $3)
               AND ST_DWithin(
                 s.coordinates::geography,
                 COALESCE(d.geometry, d.centroid)::geography,
                 $2
               )
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           )
           SELECT
             name,
             address,
             student_count,
             performance,
             lat,
             lng,
             source_links,
             distance_meters
           FROM ranked_schools
           ORDER BY distance_meters ASC, performance DESC NULLS LAST
           LIMIT 8`
          : `WITH ranked_schools AS (
             SELECT DISTINCT ON (school_identity)
               name,
               COALESCE(address, '') AS address,
               student_count,
               performance,
               ST_Y(coordinates) AS lat,
               ST_X(coordinates) AS lng,
               COALESCE(source_links, '[]'::jsonb) AS source_links,
               ST_DistanceSphere(
                 coordinates,
                 ST_SetSRID(ST_MakePoint($1, $2), 4326)
               ) AS distance_meters,
               school_identity
             FROM (
               SELECT
                 s.*,
                 COALESCE(
                   NULLIF(s.school_unit_code, ''),
                   LOWER(s.name) || '|' || LOWER(COALESCE(s.address, ''))
                 ) AS school_identity
               FROM schools s
               WHERE s.quality IN ('measured', 'derived')
             ) s
             WHERE s.coordinates IS NOT NULL
               AND ST_DWithin(
                 s.coordinates::geography,
                 ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                 $3
               )
             ORDER BY
               school_identity,
               distance_meters ASC,
               performance DESC NULLS LAST,
               student_count DESC NULLS LAST
           )
           SELECT
             name,
             address,
             student_count,
             performance,
             lat,
             lng,
             source_links,
             distance_meters
           FROM ranked_schools
           ORDER BY distance_meters ASC, performance DESC NULLS LAST
           LIMIT 8`,
      areaType === "namedDistrict"
        ? (namedDistrictSchoolQuery?.values ?? [])
        : isDistrict
          ? [deso_id, schoolRadiusMeters, schoolRadiusDegrees]
          : [areaLng, areaLat, schoolRadiusMeters],
    );

    const transportRadiusMeters = isDistrict ? 8000 : 4000;
    const addressRadiusMeters = isDistrict ? 8000 : 3500;

    const demographicsRes = await pool.query(
      areaType === "namedDistrict"
        ? `SELECT
             SUM(l.population_total)::int AS population_total,
             SUM(l.population_growth * COALESCE(ndm.priority_weight, 1)::numeric) /
               NULLIF(SUM(CASE WHEN l.population_growth IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric END), 0) AS population_growth,
             SUM(l.median_income * COALESCE(ndm.priority_weight, 1)::numeric) /
               NULLIF(SUM(CASE WHEN l.median_income IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric END), 0) AS median_income,
             SUM(l.higher_edu_pct * COALESCE(ndm.priority_weight, 1)::numeric) /
               NULLIF(SUM(CASE WHEN l.higher_edu_pct IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric END), 0) AS higher_edu_pct,
             SUM(l.families_with_kids_pct * COALESCE(ndm.priority_weight, 1)::numeric) /
               NULLIF(SUM(CASE WHEN l.families_with_kids_pct IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric END), 0) AS families_with_kids_pct,
             SUM(l.foreign_born_pct * COALESCE(ndm.priority_weight, 1)::numeric) /
               NULLIF(SUM(CASE WHEN l.foreign_born_pct IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric END), 0) AS foreign_born_pct,
             MAX(l.year) AS year,
             COALESCE(
               jsonb_agg(DISTINCT src.link) FILTER (WHERE src.link IS NOT NULL),
               '[]'::jsonb
             ) AS source_links
           FROM named_district_deso_map ndm
           CROSS JOIN LATERAL (${latestDemographicsSql("deso_id", "ndm.deso_id")}) l
           LEFT JOIN LATERAL jsonb_array_elements(l.source_links) src(link) ON TRUE
           WHERE ndm.district_id = $1`
        : isDistrict
          ? latestDemographicsSql("district_id")
          : latestDemographicsSql("deso_id"),
      [deso_id],
    );

    const projectsRes = await pool.query(
      areaType === "namedDistrict"
        ? `SELECT
           title,
           COALESCE(project_type, 'infrastructure') AS project_type,
           confidence,
           EXTRACT(YEAR FROM NOW())::int + 1 AS year,
           COALESCE(status, 'planned') AS status,
           COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM future_projects
         WHERE quality IN ('measured', 'derived') AND deso_id IN (
           SELECT deso_id
           FROM named_district_deso_map
           WHERE district_id = $1
         )
         ORDER BY confidence DESC NULLS LAST, title ASC
         LIMIT 10`
        : isDistrict
          ? `SELECT
           title,
           COALESCE(project_type, 'infrastructure') AS project_type,
           confidence,
           EXTRACT(YEAR FROM NOW())::int + 1 AS year,
            COALESCE(status, 'planned') AS status,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM future_projects
         WHERE district_id = $1 AND quality IN ('measured', 'derived')
         ORDER BY confidence DESC NULLS LAST, title ASC
         LIMIT 10`
          : `SELECT
           title,
           COALESCE(project_type, 'infrastructure') AS project_type,
           confidence,
           EXTRACT(YEAR FROM NOW())::int + 1 AS year,
            COALESCE(status, 'planned') AS status,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM future_projects
         WHERE deso_id = $1 AND quality IN ('measured', 'derived')
         ORDER BY confidence DESC NULLS LAST, title ASC
         LIMIT 10`,
      [deso_id],
    );

    const crimeRes = await pool.query(
      areaType === "namedDistrict"
        ? `SELECT
             year,
             SUM(incident_count)::int AS incident_count,
             CASE
               WHEN COUNT(*) FILTER (WHERE trend = 'up') > COUNT(*) FILTER (WHERE trend = 'down') THEN 'up'
               WHEN COUNT(*) FILTER (WHERE trend = 'down') > COUNT(*) FILTER (WHERE trend = 'up') THEN 'down'
               ELSE 'stable'
             END AS trend
           FROM crime_stats
           WHERE quality IN ('measured', 'derived') AND deso_id IN (
             SELECT deso_id
             FROM named_district_deso_map
             WHERE district_id = $1
           )
           GROUP BY year
           ORDER BY year DESC
           LIMIT 5`
        : isDistrict
          ? `SELECT year, incident_count, trend
       FROM crime_stats
       WHERE district_id = $1 AND quality IN ('measured', 'derived')
       ORDER BY year DESC
       LIMIT 5`
          : `SELECT year, incident_count, trend
       FROM crime_stats
       WHERE deso_id = $1 AND quality IN ('measured', 'derived')
       ORDER BY year DESC
       LIMIT 5`,
      [deso_id],
    );

    const transportRes = await pool.query(
      `SELECT
         COUNT(*)::int AS stop_count,
         AVG(route_count) AS avg_routes,
         MIN(ST_DistanceSphere(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS nearest_meters,
         COALESCE(
           jsonb_agg(DISTINCT src.link) FILTER (WHERE src.link IS NOT NULL),
           '[]'::jsonb
         ) AS source_links
       FROM transport_stops
       LEFT JOIN LATERAL jsonb_array_elements(COALESCE(source_links, '[]'::jsonb)) src(link) ON TRUE
       WHERE quality IN ('measured', 'derived') AND ST_DWithin(
         coordinates::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )`,
      [areaLng, areaLat, transportRadiusMeters],
    );

    const addressesRes = await pool.query(
      `SELECT
         COUNT(*)::int AS address_count,
         MIN(ST_DistanceSphere(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS nearest_meters,
         COALESCE(
           jsonb_agg(DISTINCT src.link) FILTER (WHERE src.link IS NOT NULL),
           '[]'::jsonb
         ) AS source_links
       FROM addresses
       LEFT JOIN LATERAL jsonb_array_elements(COALESCE(source_links, '[]'::jsonb)) src(link) ON TRUE
       WHERE quality IN ('measured', 'derived') AND ST_DWithin(
         coordinates::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )`,
      [areaLng, areaLat, addressRadiusMeters],
    );

    const projectsCountRes = await pool.query(
      areaType === "namedDistrict"
        ? `SELECT COUNT(*)::int AS project_count
         FROM future_projects
         WHERE quality IN ('measured', 'derived') AND deso_id IN (
           SELECT deso_id
           FROM named_district_deso_map
           WHERE district_id = $1
         )`
        : isDistrict
          ? `SELECT COUNT(*)::int AS project_count
       FROM future_projects
       WHERE district_id = $1 AND quality IN ('measured', 'derived')`
          : `SELECT COUNT(*)::int AS project_count
       FROM future_projects
       WHERE deso_id = $1 AND quality IN ('measured', 'derived')`,
      [deso_id],
    );

    const scoreView = publicScores(scores as Record<string, unknown>);

    const schools = schoolsRes.rows.map((row) => {
      const performance = toNumeric(row.performance);
      const distanceMeters = toNumeric(row.distance_meters);
      const distanceKm = distanceMeters != null ? distanceMeters / 1000 : null;
      const walkMin = distanceKm != null ? Math.max(1, Math.round((distanceKm / 5) * 60)) : null; // ~5 km/h
      const distanceLabel =
        distanceMeters == null
          ? "-"
          : distanceMeters < 100
            ? "< 0.1 km"
            : distanceMeters < 1000
              ? `${(distanceMeters / 1000).toFixed(1)} km`
              : `${Math.round(distanceMeters / 1000)} km`;
      return {
        name: String(row.name ?? ""),
        address: String(row.address ?? ""),
        distance: distanceLabel,
        walkMin,
        students: toNumeric(row.student_count),
        performance,
        lat: toNumeric(row.lat),
        lng: toNumeric(row.lng),
        // Only derived from a real performance figure; never defaulted.
        inspection:
          performance === null
            ? null
            : performance >= 90
              ? "Excellent"
              : performance >= 75
                ? "Approved"
                : "Needs review",
        sourceLinks: parseSourceLinks(row.source_links),
      };
    });

    const demo = demographicsRes.rows[0] ?? null;
    const transport = transportRes.rows[0] ?? { stop_count: 0, nearest_meters: null };
    const addressCount = Number(addressesRes.rows[0]?.address_count ?? 0);

    const future = projectsRes.rows.map((row) => {
      const typeRaw = String(row.project_type ?? "").toLowerCase();
      const mappedType = typeRaw.includes("school")
        ? "School"
        : typeRaw.includes("transport")
          ? "Transport"
          : typeRaw.includes("housing")
            ? "Housing"
            : typeRaw.includes("park")
              ? "Park"
              : "Road";

      return {
        year: Number(row.year),
        title: String(row.title ?? ""),
        type: mappedType,
        confidence: toNumeric(row.confidence),
        sourceLinks: parseSourceLinks(row.source_links),
      };
    });
    const projectCount = Number(projectsCountRes.rows[0]?.project_count ?? 0);

    const amenities = [
      {
        label: "Schools",
        icon: "🏫",
        count: schools.length,
        nearest: schools[0]?.distance ?? "-",
        sourceLinks: schools.flatMap((school) => school.sourceLinks ?? []),
      },
      {
        label: "Transit stops",
        icon: "🚆",
        count: Number(transport.stop_count ?? 0),
        nearest: formatDistanceKm(transport.nearest_meters ?? null),
        sourceLinks: parseSourceLinks(transport.source_links),
      },
      {
        label: "Addresses",
        icon: "🏠",
        count: addressCount,
        nearest: formatDistanceKm(addressesRes.rows[0]?.nearest_meters ?? null),
        sourceLinks: parseSourceLinks(addressesRes.rows[0]?.source_links),
      },
      {
        label: "Future projects",
        icon: "🏗️",
        count: projectCount,
        nearest: "-",
        sourceLinks: future.flatMap((project) => project.sourceLinks ?? []),
      },
    ];

    const crimeStats = crimeRes.rows.map((row) => ({
      year: Number(row.year),
      incidents: toNumeric(row.incident_count),
      trend: row.trend ? String(row.trend) : null,
    }));

    const growthScore = scoreView.growth;
    const growthPrediction =
      growthScore === null
        ? null
        : {
            level: growthScore >= 85 ? "High" : growthScore >= 70 ? "Medium" : "Low",
            confidence: growthScore,
            rationale: `Based on ${projectCount} planned projects and the area's growth score.`,
          };

    return sendApiSuccess(reply, {
      area: {
        id: area.id,
        name: area.name ?? "",
        municipality: area.municipality ?? "Unknown",
        population: demo ? toNumeric(demo.population_total) : toNumeric(area.population),
        coordinates: {
          lat: area.lat ?? undefined,
          lng: area.lng ?? undefined,
        },
      },
      scores: scoreView,
      details: {
        schools,
        // No commute data source exists yet (DR-51).
        commute: null,
        amenities,
        demographics: demo
          ? {
              population: toNumeric(demo.population_total),
              year: toNumeric(demo.year),
              growth: toNumeric(demo.population_growth),
              medianIncome: toNumeric(demo.median_income),
              familiesPct: toNumeric(demo.families_with_kids_pct),
              higherEduPct: toNumeric(demo.higher_edu_pct),
              foreignBornPct: toNumeric(demo.foreign_born_pct),
              avgAge: null,
              ownershipPct: null,
              sourceLinks: parseSourceLinks(demo.source_links),
            }
          : null,
        future,
        safety: scoreView.safety,
        crimeStats,
        growthPrediction,
      },
    });
  });

  fastify.get("/neighborhood-score", async (request, reply) => {
    const query = parseOrReply(z.object({ id: z.string().min(1) }), request.query, reply);
    if (!query) {
      return;
    }

    const { id } = query;

    const areaData = await getAreaDetails(id);
    if (areaData?.areaType === "namedDistrict") {
      const scores = await getScores(id, "namedDistrict");
      return sendApiSuccess(reply, scorePayload("district", scores));
    }

    // Try district first
    const districtResult = await db
      .select()
      .from(districtScores)
      .where(eq(districtScores.districtId, id))
      .limit(1);

    if (districtResult.length > 0) {
      const scores = districtResult[0];
      return sendApiSuccess(reply, scorePayload("district", scores));
    }

    // Try DESO area
    const desoResult = await db
      .select()
      .from(neighborhoodScores)
      .where(eq(neighborhoodScores.desoId, id))
      .limit(1);

    if (desoResult.length === 0) {
      return sendApiError(reply, 404, "NOT_FOUND", "Area not found");
    }

    const scores = desoResult[0];
    return sendApiSuccess(reply, scorePayload("deso", scores));
  });
}

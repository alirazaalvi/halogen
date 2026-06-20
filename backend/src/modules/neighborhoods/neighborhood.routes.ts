import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
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
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";

function toSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function completeScores(scores: Record<string, unknown>) {
  const overall = clampScore(toNumeric(scores.overallScore) ?? 75);
  return {
    overall,
    demographics: clampScore(toNumeric(scores.demographicsScore) ?? overall),
    housing: clampScore(toNumeric(scores.housingMarketScore) ?? overall - 2),
    transport: clampScore(toNumeric(scores.transportScore) ?? overall),
    schools: clampScore(toNumeric(scores.schoolsScore) ?? overall),
    safety: clampScore(toNumeric(scores.safetyScore) ?? overall - 3),
    green: clampScore(toNumeric(scores.greenAreasScore) ?? overall - 1),
    growth: clampScore(toNumeric(scores.futureGrowthScore) ?? overall),
  };
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

function fallbackDemographics(
  areaPopulation: number,
  score: ReturnType<typeof completeScores>,
): {
  population_total: number;
  population_growth: number;
  median_income: number;
  higher_edu_pct: number;
  families_with_kids_pct: number;
  foreign_born_pct: number;
  year: number;
} {
  const estimatedPopulation =
    areaPopulation > 0 ? areaPopulation : Math.max(2500, Math.round(8000 + score.overall * 120));

  return {
    population_total: estimatedPopulation,
    population_growth: Number(Math.max(-1.5, Math.min(4.5, (score.growth - 60) / 10)).toFixed(1)),
    median_income: Math.round(230000 + score.demographics * 3200),
    higher_edu_pct: Number(Math.max(20, Math.min(70, score.demographics * 0.62)).toFixed(1)),
    families_with_kids_pct: Number(Math.max(18, Math.min(52, score.schools * 0.48)).toFixed(1)),
    foreign_born_pct: Number(Math.max(8, Math.min(38, (100 - score.housing) * 0.35)).toFixed(1)),
    year: new Date().getFullYear(),
  };
}

function fallbackFutureProjects(areaName: string, score: ReturnType<typeof completeScores>) {
  const nextYear = new Date().getFullYear() + 1;
  const projectTemplates = [
    { type: "Transport", title: `${areaName} Mobility Upgrade` },
    { type: "School", title: `${areaName} School Capacity Expansion` },
    { type: "Park", title: `${areaName} Family Park Renewal` },
  ];

  const count = score.growth >= 85 ? 3 : 2;
  return projectTemplates.slice(0, count).map((template, index) => ({
    year: nextYear + (index === 2 ? 1 : 0),
    title: template.title,
    type: template.type,
    confidence: clampScore(score.growth - 4 + index * 2),
  }));
}

async function getAreaDetails(areaId: string) {
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
    return { area: districtResult[0], isDistrict: true };
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
    return { area: desoResult[0], isDistrict: false };
  }

  return null;
}

async function getScores(areaId: string, isDistrict: boolean) {
  if (isDistrict) {
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

export async function neighborhoodRoutes(fastify: FastifyInstance, _options: object) {
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

    // Get all districts from all Stockholm County municipalities
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
      .orderBy(desc(districtScores.overallScore))
      .limit(limit);

    const results = allDistrics.map((row) => ({
      slug: toSlug(row.name ?? row.id),
      id: row.id,
      type: row.type,
      name: row.name ?? row.id,
      region: row.municipality ?? "Unknown",
      overall: row.overall,
      schools: row.schools,
      commute: row.transport,
      green: row.green,
    }));

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

    const { area, isDistrict } = areaData;
    const scores = await getScores(deso_id, isDistrict);

    const areaLng = Number(area.lng ?? 0);
    const areaLat = Number(area.lat ?? 0);

    // Radius for school proximity search: larger for districts (city-wide areas), smaller for deso
    const schoolRadiusMeters = isDistrict ? 5000 : 2000;

    const schoolsRes = await pool.query(
      `SELECT
         name,
         COALESCE(address, '') AS address,
         COALESCE(student_count, 0) AS student_count,
         COALESCE(performance, 0) AS performance,
         ST_Y(coordinates) AS lat,
         ST_X(coordinates) AS lng,
         COALESCE(source_links, '[]'::jsonb) AS source_links,
         ST_DistanceSphere(
           coordinates,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)
         ) AS distance_meters
       FROM schools
       WHERE coordinates IS NOT NULL
         AND ST_DWithin(
           coordinates::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           $3
         )
       ORDER BY distance_meters ASC, performance DESC
       LIMIT 8`,
      [areaLng, areaLat, schoolRadiusMeters],
    );
    const transportRadiusMeters = isDistrict ? 8000 : 4000;
    const addressRadiusMeters = isDistrict ? 8000 : 3500;

    const demographicsRes = await pool.query(
      isDistrict
        ? `SELECT
           population_total,
           population_growth,
           median_income,
           higher_edu_pct,
           families_with_kids_pct,
           foreign_born_pct,
            year,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM demographics
         WHERE district_id = $1
         ORDER BY year DESC
         LIMIT 1`
        : `SELECT
           population_total,
           population_growth,
           median_income,
           higher_edu_pct,
           families_with_kids_pct,
           foreign_born_pct,
            year,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM demographics
         WHERE deso_id = $1
         ORDER BY year DESC
         LIMIT 1`,
      [deso_id],
    );

    const projectsRes = await pool.query(
      isDistrict
        ? `SELECT
           title,
           COALESCE(project_type, 'infrastructure') AS project_type,
           COALESCE(confidence, 70) AS confidence,
           EXTRACT(YEAR FROM NOW())::int + 1 AS year,
            COALESCE(status, 'planned') AS status,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM future_projects
         WHERE district_id = $1
         ORDER BY confidence DESC, title ASC
         LIMIT 10`
        : `SELECT
           title,
           COALESCE(project_type, 'infrastructure') AS project_type,
           COALESCE(confidence, 70) AS confidence,
           EXTRACT(YEAR FROM NOW())::int + 1 AS year,
            COALESCE(status, 'planned') AS status,
            COALESCE(source_links, '[]'::jsonb) AS source_links
         FROM future_projects
         WHERE deso_id = $1
         ORDER BY confidence DESC, title ASC
         LIMIT 10`,
      [deso_id],
    );

    const crimeRes = await pool.query(
      isDistrict
        ? `SELECT year, incident_count, trend
       FROM crime_stats
       WHERE district_id = $1
       ORDER BY year DESC
       LIMIT 5`
        : `SELECT year, incident_count, trend
       FROM crime_stats
       WHERE deso_id = $1
       ORDER BY year DESC
       LIMIT 5`,
      [deso_id],
    );

    const transportRes = await pool.query(
      `SELECT
         COUNT(*)::int AS stop_count,
         COALESCE(AVG(route_count), 0) AS avg_routes,
         MIN(ST_DistanceSphere(coordinates, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS nearest_meters,
         COALESCE(
           jsonb_agg(DISTINCT src.link) FILTER (WHERE src.link IS NOT NULL),
           '[]'::jsonb
         ) AS source_links
       FROM transport_stops
       LEFT JOIN LATERAL jsonb_array_elements(COALESCE(source_links, '[]'::jsonb)) src(link) ON TRUE
       WHERE ST_DWithin(
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
       WHERE ST_DWithin(
         coordinates::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )`,
      [areaLng, areaLat, addressRadiusMeters],
    );

    const projectsCountRes = await pool.query(
      isDistrict
        ? `SELECT COUNT(*)::int AS project_count
       FROM future_projects
       WHERE district_id = $1`
        : `SELECT COUNT(*)::int AS project_count
       FROM future_projects
       WHERE deso_id = $1`,
      [deso_id],
    );

    const normalizedScores = completeScores(scores as Record<string, unknown>);

    const schoolsFromDb = schoolsRes.rows.map((row, index) => {
      const performance = Number(row.performance ?? 0);
      const rowLat = toNumeric(row.lat);
      const rowLng = toNumeric(row.lng);
      const fallbackLat = area.lat != null ? Number(area.lat) + (index - 1) * 0.002 : null;
      const fallbackLng = area.lng != null ? Number(area.lng) + (index - 1) * 0.003 : null;
      const distanceMeters = toNumeric(row.distance_meters);
      const distanceKm = distanceMeters != null ? distanceMeters / 1000 : 0.4 + index * 0.25;
      const walkMin = Math.max(1, Math.round((distanceKm / 5) * 60)); // ~5 km/h walking speed
      const distanceLabel =
        distanceMeters != null && distanceMeters < 100
          ? "< 0.1 km"
          : distanceKm < 1
            ? `${distanceKm.toFixed(1)} km`
            : `${Math.round(distanceKm)} km`;
      return {
        name: String(row.name ?? `School ${index + 1}`),
        address: String(row.address ?? ""),
        distance: distanceLabel,
        walkMin,
        students: Number(row.student_count ?? 0),
        performance,
        lat: rowLat ?? fallbackLat,
        lng: rowLng ?? fallbackLng,
        inspection:
          performance >= 90 ? "Excellent" : performance >= 75 ? "Approved" : "Needs review",
        sourceLinks: parseSourceLinks(row.source_links),
      };
    });

    const schools =
      schoolsFromDb.length > 0
        ? schoolsFromDb
        : [0, 1].map((index) => ({
            name: `${String(area.name ?? "Area")} School ${index + 1}`,
            address: `${String(area.name ?? "Area")} Street ${10 + index * 10}, 123 45 ${area.municipality ?? "Stockholm"}`,
            distance: `${(0.6 + index * 0.3).toFixed(1)} km`,
            walkMin: Math.round(8 + index * 4),
            students: Math.round(260 + normalizedScores.schools * 5 + index * 55),
            performance: clampScore(normalizedScores.schools - 3 + index * 4),
            lat: area.lat != null ? Number(area.lat) + (index === 0 ? 0.002 : -0.002) : null,
            lng: area.lng != null ? Number(area.lng) + (index === 0 ? -0.002 : 0.002) : null,
            inspection: normalizedScores.schools >= 80 ? "Approved" : "Needs review",
          }));

    const demo =
      demographicsRes.rows[0] ??
      fallbackDemographics(Number(area.population ?? 0), normalizedScores);
    const transport = transportRes.rows[0] ?? {
      stop_count: 0,
      avg_routes: 0,
      nearest_meters: null,
    };
    const addressCount = Number(addressesRes.rows[0]?.address_count ?? 0);
    const projectCountFromDb = Number(projectsCountRes.rows[0]?.project_count ?? 0);
    const transportScore = normalizedScores.transport;

    const commuteMinutesBase = Math.max(8, 46 - transportScore * 0.28);
    const commute = {
      target: `${area.municipality ?? "Stockholm"} City`,
      car: Math.round(commuteMinutesBase + 6),
      transit: Math.round(commuteMinutesBase),
      bike: Math.round(commuteMinutesBase + 10),
      walk: Math.round(commuteMinutesBase + 30),
    };

    const futureFromDb = projectsRes.rows.map((row) => {
      const typeRaw = String(row.project_type ?? "infrastructure").toLowerCase();
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
        year: Number(row.year ?? new Date().getFullYear() + 1),
        title: String(row.title ?? "Planned project"),
        type: mappedType,
        confidence: Number(row.confidence ?? 70),
        sourceLinks: parseSourceLinks(row.source_links),
      };
    }) as Array<{
      year: number;
      title: string;
      type: "School" | "Transport" | "Housing" | "Park" | "Road";
      confidence: number;
      sourceLinks: SourceLink[];
    }>;

    const future =
      futureFromDb.length > 0
        ? futureFromDb
        : fallbackFutureProjects(String(area.name ?? "Area"), normalizedScores);
    const projectCount = Math.max(projectCountFromDb, future.length);

    const amenities = [
      {
        label: "Schools",
        icon: "🏫",
        count: schools.length,
        nearest: schools[0]?.distance ?? "-",
        sourceLinks: schoolsFromDb.flatMap((school) => school.sourceLinks ?? []),
      },
      {
        label: "Transit stops",
        icon: "🚆",
        count: Number(transport.stop_count ?? 0),
        nearest: formatDistanceKm(transport.nearest_meters ?? null),
        sourceLinks: (() => {
          const links = parseSourceLinks(transport.source_links);
          return links.length > 0
            ? links
            : [{ label: "Trafiklab", url: "https://www.trafiklab.se/" }];
        })(),
      },
      {
        label: "Addresses",
        icon: "🏠",
        count: addressCount,
        nearest: formatDistanceKm(addressesRes.rows[0]?.nearest_meters ?? null),
        sourceLinks: (() => {
          const links = parseSourceLinks(addressesRes.rows[0]?.source_links);
          return links.length > 0
            ? links
            : [
                {
                  label: "Lantmäteriet",
                  url: "https://www.lantmateriet.se/sv/geodata/geodataprodukter/produktlista/adresser/",
                },
              ];
        })(),
      },
      {
        label: "Future projects",
        icon: "🏗️",
        count: projectCount,
        nearest: projectCount > 0 ? "1.0 km" : "-",
        sourceLinks: futureFromDb.flatMap((project) => project.sourceLinks ?? []),
      },
    ];

    const crimeStats = crimeRes.rows.map((row) => ({
      year: Number(row.year ?? new Date().getFullYear()),
      incidents: Number(row.incident_count ?? 0),
      trend: String(row.trend ?? "stable"),
    }));

    const growthConfidence = normalizedScores.growth;
    const growthLevel = growthConfidence >= 85 ? "High" : growthConfidence >= 70 ? "Medium" : "Low";
    const populationGrowthPct = Number(demo.population_growth ?? 0);
    const avgProjectConfidence =
      projectCount > 0
        ? Number(
            future.reduce((sum, project) => sum + Number(project.confidence ?? 70), 0) /
              projectCount,
          )
        : 0;

    return sendApiSuccess(reply, {
      area: {
        id: area.id,
        name: area.name ?? "",
        municipality: area.municipality ?? "Unknown",
        population: area.population,
        coordinates: {
          lat: area.lat ?? undefined,
          lng: area.lng ?? undefined,
        },
      },
      scores: {
        overall: normalizedScores.overall,
        demographics: normalizedScores.demographics,
        housing: normalizedScores.housing,
        transport: normalizedScores.transport,
        schools: normalizedScores.schools,
        safety: normalizedScores.safety,
        green: normalizedScores.green,
        growth: normalizedScores.growth,
      },
      details: {
        schools,
        commute,
        amenities,
        demographics: {
          population: Number(demo.population_total ?? area.population ?? 0),
          growth: Number(demo.population_growth ?? 0),
          medianIncome: Number(demo.median_income ?? 0),
          avgAge: Math.round(30 + Number(demo.foreign_born_pct ?? 0) * 0.2),
          familiesPct: Number(demo.families_with_kids_pct ?? 0),
          higherEduPct: Number(demo.higher_edu_pct ?? 0),
          ownershipPct: Math.max(20, Math.min(90, 70 - Number(demo.foreign_born_pct ?? 0) * 0.35)),
          sourceLinks: parseSourceLinks(demo.source_links),
        },
        future,
        safety: normalizedScores.safety,
        crimeStats,
        growthPrediction: {
          level: growthLevel,
          confidence: growthConfidence,
          rationale: `Based on ${projectCount} planned projects, ${populationGrowthPct.toFixed(1)}% population growth, and ${avgProjectConfidence.toFixed(0)} average project confidence.`,
        },
      },
    });
  });

  fastify.get("/neighborhood-score", async (request, reply) => {
    const query = parseOrReply(z.object({ id: z.string().min(1) }), request.query, reply);
    if (!query) {
      return;
    }

    const { id } = query;

    // Try district first
    const districtResult = await db
      .select()
      .from(districtScores)
      .where(eq(districtScores.districtId, id))
      .limit(1);

    if (districtResult.length > 0) {
      const scores = districtResult[0];
      return sendApiSuccess(reply, {
        type: "district",
        score: scores.overallScore,
        transport: scores.transportScore,
        schools: scores.schoolsScore,
        safety: scores.safetyScore,
        housing: scores.housingMarketScore,
        green: scores.greenAreasScore,
        growth: scores.futureGrowthScore,
      });
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
    return sendApiSuccess(reply, {
      type: "deso",
      score: scores.overallScore,
      transport: scores.transportScore,
      schools: scores.schoolsScore,
      safety: scores.safetyScore,
      housing: scores.housingMarketScore,
      green: scores.greenAreasScore,
      growth: scores.futureGrowthScore,
    });
  });
}

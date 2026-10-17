import { eq, inArray, sql } from "drizzle-orm";
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
import { getPrimaryDistrictAliasMap } from "../../lib/district-aliases";
import type { RouteApp } from "../../lib/http/route-app";

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function compareRoutes(fastify: RouteApp, _options: object) {
  fastify.get("/compare", async (request, reply) => {
    const parsed = parseOrReply(
      z.object({ a: z.string().min(1), b: z.string().min(1) }),
      request.query,
      reply,
    );
    if (!parsed) {
      return;
    }

    const { a, b } = parsed;

    if (!a || !b) {
      return sendApiError(reply, 400, "BAD_REQUEST", "Both area IDs required");
    }

    const ids = [a, b];

    const namedDistrictRowsRes = await pool.query(
      `SELECT
         nd.id,
         nd.name,
         m.name AS municipality,
         'district' AS type,
         SUM(ns.overall_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.overall_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS overall,
         SUM(ns.demographics_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.demographics_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS demographics,
         SUM(ns.housing_market_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.housing_market_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS housing,
         SUM(ns.transport_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.transport_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS transport,
         SUM(ns.schools_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.schools_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS schools,
         SUM(ns.safety_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.safety_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS safety,
         SUM(ns.green_areas_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.green_areas_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS green,
         SUM(ns.future_growth_score * COALESCE(ndm.priority_weight, 1)::numeric) /
           NULLIF(SUM(CASE WHEN ns.future_growth_score IS NOT NULL THEN COALESCE(ndm.priority_weight, 1)::numeric ELSE 0 END), 0) AS growth
       FROM named_districts nd
       LEFT JOIN municipalities m ON m.id = nd.municipality_id
       LEFT JOIN named_district_deso_map ndm ON ndm.district_id = nd.id
       LEFT JOIN neighborhood_scores ns ON ns.deso_id = ndm.deso_id
       WHERE nd.id = ANY($1::varchar[])
       GROUP BY nd.id, nd.name, m.name`,
      [ids],
    );

    const districtRows = await db
      .select({
        id: districts.id,
        name: districts.name,
        municipality: municipalities.name,
        type: sql<"district">`'district'`,
        overall: districtScores.overallScore,
        demographics: districtScores.demographicsScore,
        housing: districtScores.housingMarketScore,
        transport: districtScores.transportScore,
        schools: districtScores.schoolsScore,
        safety: districtScores.safetyScore,
        green: districtScores.greenAreasScore,
        growth: districtScores.futureGrowthScore,
      })
      .from(districts)
      .leftJoin(municipalities, eq(districts.municipalityId, municipalities.id))
      .leftJoin(districtScores, eq(districtScores.districtId, districts.id))
      .where(inArray(districts.id, ids));

    const desoRows = await db
      .select({
        id: desoAreas.id,
        name: desoAreas.name,
        municipality: municipalities.name,
        type: sql<"deso">`'deso'`,
        overall: neighborhoodScores.overallScore,
        demographics: neighborhoodScores.demographicsScore,
        housing: neighborhoodScores.housingMarketScore,
        transport: neighborhoodScores.transportScore,
        schools: neighborhoodScores.schoolsScore,
        safety: neighborhoodScores.safetyScore,
        green: neighborhoodScores.greenAreasScore,
        growth: neighborhoodScores.futureGrowthScore,
      })
      .from(desoAreas)
      .leftJoin(municipalities, eq(desoAreas.municipalityId, municipalities.id))
      .leftJoin(neighborhoodScores, eq(neighborhoodScores.desoId, desoAreas.id))
      .where(inArray(desoAreas.id, ids));

    const districtAliasMap = await getPrimaryDistrictAliasMap(districtRows.map((row) => row.id));
    const aliasedDistrictRows = districtRows.map((row) => ({
      ...row,
      name: districtAliasMap.get(row.id) ?? row.name,
    }));

    const namedDistrictRows = namedDistrictRowsRes.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      municipality: row.municipality ? String(row.municipality) : null,
      type: "district" as const,
      overall: row.overall,
      demographics: row.demographics,
      housing: row.housing,
      transport: row.transport,
      schools: row.schools,
      safety: row.safety,
      green: row.green,
      growth: row.growth,
    }));

    const byId = new Map(
      [...namedDistrictRows, ...aliasedDistrictRows, ...desoRows].map((row) => [row.id, row]),
    );
    const areaA = byId.get(a);
    const areaB = byId.get(b);

    if (!areaA || !areaB) {
      return sendApiError(reply, 404, "NOT_FOUND", "One or both areas not found");
    }

    const formatArea = (area: typeof areaA) => ({
      id: area.id,
      deso_id: area.id,
      type: area.type,
      name: area.name ?? area.id,
      municipality: area.municipality ?? "Unknown",
      scores: {
        overall: toNumeric(area.overall),
        demographics: toNumeric(area.demographics),
        housing: toNumeric(area.housing),
        transport: toNumeric(area.transport),
        schools: toNumeric(area.schools),
        safety: toNumeric(area.safety),
        green: toNumeric(area.green),
        growth: toNumeric(area.growth),
      },
    });

    return sendApiSuccess(reply, {
      comparison: [formatArea(areaA), formatArea(areaB)],
    });
  });
}

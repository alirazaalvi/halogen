import { eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client";
import {
  desoAreas,
  districtScores,
  districts,
  municipalities,
  neighborhoodScores,
} from "../../db/schema";
import { sendApiError, sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function compareRoutes(fastify: FastifyInstance, _options: object) {
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

    const byId = new Map([...districtRows, ...desoRows].map((row) => [row.id, row]));
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

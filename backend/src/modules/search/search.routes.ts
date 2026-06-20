import { ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client";
import { desoAreas, districts, municipalities } from "../../db/schema";
import { sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";

const searchSchema = z.object({
  q: z.string().min(1),
});

export async function searchRoutes(fastify: FastifyInstance, _options: object) {
  fastify.get("/search", async (request, reply) => {
    const params = parseOrReply(searchSchema, request.query, reply);
    if (!params) {
      return;
    }

    const { q } = params;

    // Search DESO areas
    const desoResult = await db
      .select({
        id: desoAreas.id,
        name: desoAreas.name,
        municipality: municipalities.name,
        type: sql<string>`'deso'`,
        lat: sql<number | null>`ST_Y(${desoAreas.centroid})`,
        lng: sql<number | null>`ST_X(${desoAreas.centroid})`,
      })
      .from(desoAreas)
      .leftJoin(municipalities, sql`${desoAreas.municipalityId} = ${municipalities.id}`)
      .where(
        or(
          ilike(desoAreas.name, `%${q}%`),
          ilike(municipalities.name, `%${q}%`),
          ilike(desoAreas.id, `%${q}%`),
        ),
      )
      .limit(5);

    // Search districts
    const districtResult = await db
      .select({
        id: districts.id,
        name: districts.name,
        municipality: municipalities.name,
        type: sql<string>`'district'`,
        lat: sql<number | null>`ST_Y(${districts.centroid})`,
        lng: sql<number | null>`ST_X(${districts.centroid})`,
      })
      .from(districts)
      .leftJoin(municipalities, sql`${districts.municipalityId} = ${municipalities.id}`)
      .where(or(ilike(districts.name, `%${q}%`), ilike(municipalities.name, `%${q}%`)))
      .limit(5);

    // Combine and deduplicate results
    const allResults = [...desoResult, ...districtResult];
    const uniqueResults = Array.from(
      new Map(allResults.map((item) => [item.id, item])).values(),
    ).slice(0, 10);

    return sendApiSuccess(reply, {
      results: uniqueResults.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name ?? "",
        municipality: row.municipality ?? undefined,
        lat: row.lat ?? undefined,
        lng: row.lng ?? undefined,
      })),
    });
  });
}

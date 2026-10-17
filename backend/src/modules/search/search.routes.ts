import { ilike, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/client";
import { pool } from "../../db/connection";
import { desoAreas, districts, municipalities } from "../../db/schema";
import { sendApiSuccess } from "../../lib/api/contracts";
import { parseOrReply } from "../../lib/api/validation";
import { getPrimaryDistrictAliasMap, normalizeDistrictAlias } from "../../lib/district-aliases";

const searchSchema = z.object({
  q: z.string().min(1),
});

type SearchSource = "namedDistrict" | "alias" | "district" | "deso";

type SearchRow = {
  id: string;
  name: string;
  municipality: string | null;
  type: string;
  lat?: number | null;
  lng?: number | null;
  searchSource: SearchSource;
};

export async function searchRoutes(fastify: FastifyInstance, _options: object) {
  fastify.get("/search", async (request, reply) => {
    const params = parseOrReply(searchSchema, request.query, reply);
    if (!params) {
      return;
    }

    const { q } = params;
    const normalizedQuery = normalizeDistrictAlias(q);
    const namedDistrictResult = await pool.query(
      `SELECT
         nd.id,
         nd.name,
         m.name AS municipality,
         'district' AS type,
         ST_Y(nd.centroid) AS lat,
         ST_X(nd.centroid) AS lng
       FROM named_districts nd
       LEFT JOIN municipalities m ON m.id = nd.municipality_id
       WHERE nd.normalized_name LIKE $1
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(nd.raw_data->'search_aliases', '[]'::jsonb)) alias(term)
            WHERE LOWER(alias.term) LIKE $2
          )
       ORDER BY
         CASE
           WHEN nd.normalized_name = $3 THEN 0
           WHEN nd.normalized_name LIKE $1 THEN 1
           ELSE 2
         END,
         nd.name ASC
       LIMIT 8`,
      [`%${normalizedQuery}%`, `%${q.toLowerCase()}%`, normalizedQuery],
    );

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
      .where(
        or(
          ilike(districts.name, `%${q}%`),
          ilike(municipalities.name, `%${q}%`),
          ilike(districts.id, `%${q}%`),
        ),
      )
      .limit(5);

    const districtAliasResult = await pool.query(
      `SELECT DISTINCT ON (d.id)
         d.id,
         COALESCE(best.alias_name, d.name) AS name,
         m.name AS municipality,
         'district' AS type,
         ST_Y(d.centroid) AS lat,
         ST_X(d.centroid) AS lng
       FROM district_aliases matched
       JOIN districts d ON d.id = matched.district_id
       LEFT JOIN municipalities m ON m.id = d.municipality_id
       LEFT JOIN LATERAL (
         SELECT alias_name
         FROM district_aliases best
         WHERE best.district_id = d.id
           AND best.is_display = TRUE
         ORDER BY best.priority ASC, best.alias_name ASC
         LIMIT 1
       ) best ON TRUE
       WHERE COALESCE(d.type, '') <> 'municipality'
         AND matched.normalized_alias LIKE $1
       ORDER BY d.id, matched.priority ASC, matched.alias_name ASC
       LIMIT 5`,
      [`%${normalizedQuery}%`],
    );

    const districtAliasMap = await getPrimaryDistrictAliasMap(districtResult.map((row) => row.id));
    const districtRows = districtResult.map((row) => ({
      ...row,
      name: districtAliasMap.get(row.id) ?? row.name,
    }));
    const aliasRows: SearchRow[] = districtAliasResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      municipality: row.municipality ? String(row.municipality) : null,
      type: "district",
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      searchSource: "alias",
    }));
    const namedDistrictRows: SearchRow[] = namedDistrictResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      municipality: row.municipality ? String(row.municipality) : null,
      type: "district",
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
      searchSource: "namedDistrict",
    }));
    const districtRowsWithSource: SearchRow[] = districtRows.map((row) => ({
      ...row,
      name: row.name ?? "",
      municipality: row.municipality ?? null,
      type: row.type,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      searchSource: "district",
    }));
    const desoRowsWithSource: SearchRow[] = desoResult.map((row) => ({
      ...row,
      name: row.name ?? "",
      municipality: row.municipality ?? null,
      type: row.type,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      searchSource: "deso",
    }));

    // Combine and deduplicate results
    const allResults = [
      ...namedDistrictRows,
      ...aliasRows,
      ...districtRowsWithSource,
      ...desoRowsWithSource,
    ];
    const seenIds = new Set<string>();
    const seenPlaces = new Set<string>();
    const uniqueResults: SearchRow[] = [];

    for (const item of allResults) {
      const placeKey = `${normalizeDistrictAlias(item.name)}::${normalizeDistrictAlias(item.municipality ?? "")}`;
      if (seenIds.has(item.id) || seenPlaces.has(placeKey)) {
        continue;
      }

      seenIds.add(item.id);
      seenPlaces.add(placeKey);
      uniqueResults.push(item);

      if (uniqueResults.length >= 10) {
        break;
      }
    }

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

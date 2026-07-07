import { pool } from "../db/connection";

export function normalizeDistrictAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function getPrimaryDistrictAliasMap(
  districtIds: string[],
): Promise<Map<string, string>> {
  if (districtIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT DISTINCT ON (district_id)
       district_id,
       alias_name
     FROM district_aliases
     WHERE district_id = ANY($1::varchar[])
       AND is_display = TRUE
     ORDER BY district_id, priority ASC, alias_name ASC`,
    [districtIds],
  );

  return new Map(result.rows.map((row) => [String(row.district_id), String(row.alias_name)]));
}

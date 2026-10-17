/**
 * Latest non-null value per demographics column for one DeSO. Population and each SCB
 * indicator can be published for different years, so taking the newest *row* would drop
 * columns that only exist on an older row.
 */
const COLUMNS = [
  "population_total",
  "population_growth",
  "median_income",
  "higher_edu_pct",
  "foreign_born_pct",
  "families_with_kids_pct",
] as const;

export function latestDemographicsSql(
  scopeColumn: "deso_id" | "district_id",
  param = "$1",
): string {
  const latest = (column: string) =>
    `(SELECT ${column} FROM demographics
      WHERE ${scopeColumn} = ${param} AND quality IN ('measured', 'derived') AND ${column} IS NOT NULL
      ORDER BY year DESC LIMIT 1) AS ${column}`;
  return `SELECT
    ${COLUMNS.map(latest).join(",\n    ")},
    (SELECT year FROM demographics
      WHERE ${scopeColumn} = ${param} AND quality IN ('measured', 'derived') AND population_total IS NOT NULL
      ORDER BY year DESC LIMIT 1) AS year,
    COALESCE((SELECT source_links FROM demographics
      WHERE ${scopeColumn} = ${param} AND quality IN ('measured', 'derived')
      ORDER BY year DESC LIMIT 1), '[]'::jsonb) AS source_links`;
}

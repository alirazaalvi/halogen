/**
 * Data sanity and freshness checks for Stockholm (DR-63, DR-64).
 * `bun run src/lib/ingestion/run.ts check-data` exits non-zero on any error.
 */

export type Issue = {
  severity: "error" | "warn";
  check: string;
  message: string;
  count?: number;
};

/** Stockholm county, generous bounds. Coordinates outside are wrong, not unusual. */
export const STOCKHOLM_BBOX = { minLat: 58.5, maxLat: 60.3, minLng: 16.5, maxLng: 19.6 };

/** Maximum age of a successful run per source before data counts as stale. */
export const SOURCE_MAX_AGE_DAYS: Record<string, number> = {
  scb: 400, // annual statistics
  scb_indicators: 400,
  skolverket: 400,
  trafiklab: 45,
};

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export function checkFreshness(
  lastOk: ReadonlyMap<string, Date>,
  now: Date,
  maxAgeDays: Record<string, number> = SOURCE_MAX_AGE_DAYS,
): Issue[] {
  const issues: Issue[] = [];
  for (const [source, maxAge] of Object.entries(maxAgeDays)) {
    const last = lastOk.get(source);
    if (!last) {
      issues.push({
        severity: "warn",
        check: "freshness",
        message: `${source}: no successful run recorded`,
      });
      continue;
    }
    const ageDays = (now.getTime() - last.getTime()) / 86_400_000;
    if (ageDays > maxAge) {
      issues.push({
        severity: "error",
        check: "freshness",
        message: `${source}: last successful run ${Math.floor(ageDays)} days ago (limit ${maxAge})`,
      });
    }
  }
  return issues;
}

const MEASURED = "quality IN ('measured', 'derived')";

const RANGE_CHECKS: Array<{ check: string; message: string; sql: string }> = [
  {
    check: "demographics.percent_range",
    message: "demographics percentages outside 0..100",
    sql: `SELECT COUNT(*)::int AS n FROM demographics WHERE ${MEASURED} AND (
            higher_edu_pct NOT BETWEEN 0 AND 100 OR foreign_born_pct NOT BETWEEN 0 AND 100
            OR families_with_kids_pct NOT BETWEEN 0 AND 100)`,
  },
  {
    check: "demographics.positive",
    message: "demographics with non-positive population or income",
    sql: `SELECT COUNT(*)::int AS n FROM demographics WHERE ${MEASURED}
            AND (population_total <= 0 OR median_income <= 0)`,
  },
  {
    check: "demographics.duplicate_year",
    message: "DeSOs with more than one demographics row for the same year",
    sql: `SELECT COUNT(*)::int AS n FROM (
            SELECT deso_id, year FROM demographics WHERE deso_id IS NOT NULL
            GROUP BY deso_id, year HAVING COUNT(*) > 1) d`,
  },
  {
    check: "schools.performance_range",
    message: "school performance outside 0..100",
    sql: `SELECT COUNT(*)::int AS n FROM schools WHERE ${MEASURED} AND performance NOT BETWEEN 0 AND 100`,
  },
  {
    check: "scores.range",
    message: "scores outside 0..100 or coverage outside 0..1",
    sql: `SELECT COUNT(*)::int AS n FROM neighborhood_scores WHERE
            overall_score NOT BETWEEN 0 AND 100 OR demographics_score NOT BETWEEN 0 AND 100
            OR schools_score NOT BETWEEN 0 AND 100 OR transport_score NOT BETWEEN 0 AND 100
            OR safety_score NOT BETWEEN 0 AND 100 OR data_coverage NOT BETWEEN 0 AND 1`,
  },
  {
    check: "scores.overall_without_coverage",
    message: "overall scores published with coverage below 0.5",
    sql: `SELECT COUNT(*)::int AS n FROM neighborhood_scores
            WHERE overall_score IS NOT NULL AND COALESCE(data_coverage, 0) < 0.5`,
  },
];

export async function runDataChecks(db: Queryable, now = new Date()): Promise<Issue[]> {
  const issues: Issue[] = [];

  for (const check of RANGE_CHECKS) {
    const res = await db.query(check.sql);
    const count = Number(res.rows[0]?.n ?? 0);
    if (count > 0)
      issues.push({ severity: "error", check: check.check, message: check.message, count });
  }

  const bbox = STOCKHOLM_BBOX;
  for (const [table, column] of [
    ["schools", "coordinates"],
    ["transport_stops", "coordinates"],
  ] as const) {
    const res = await db.query(
      `SELECT COUNT(*)::int AS n FROM ${table}
       WHERE ${MEASURED} AND ${column} IS NOT NULL AND NOT (
         ST_Y(${column}) BETWEEN $1 AND $2 AND ST_X(${column}) BETWEEN $3 AND $4)`,
      [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng],
    );
    const count = Number(res.rows[0]?.n ?? 0);
    if (count > 0) {
      issues.push({
        severity: "error",
        check: `${table}.bbox`,
        message: `${table} outside the Stockholm bounding box`,
        count,
      });
    }
  }

  const coverage = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM demographics d
              WHERE d.deso_id = a.id AND ${MEASURED} AND d.population_total IS NOT NULL
            ))::int AS without_population
     FROM deso_areas a`,
  );
  const withoutPopulation = Number(coverage.rows[0]?.without_population ?? 0);
  if (withoutPopulation > 0) {
    issues.push({
      severity: "warn",
      check: "coverage.population",
      message: `DeSO areas without SCB population (of ${coverage.rows[0]?.total})`,
      count: withoutPopulation,
    });
  }

  const steps = await db.query(
    `SELECT source, MAX(created_at) AS last_ok
     FROM ingestion_steps WHERE status = 'ok' GROUP BY source`,
  );
  const lastOk = new Map<string, Date>(
    steps.rows.map((row) => [String(row.source), new Date(String(row.last_ok))] as [string, Date]),
  );
  issues.push(...checkFreshness(lastOk, now));

  return issues;
}

export function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) return "data checks: no issues";
  return issues
    .map(
      (i) =>
        `[${i.severity}] ${i.check}: ${i.message}${i.count !== undefined ? ` (${i.count})` : ""}`,
    )
    .join("\n");
}

import { IngestionEngine } from "./engine";
import { pool } from "../../db/connection";

async function main() {
  const engine = new IngestionEngine();
  const startedAt = Date.now();

  const command = process.argv[2] ?? "full-backfill";
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  const arg3 = process.argv[5];

  const yearArg = Number.parseInt(arg1 ?? arg3 ?? "2025", 10);
  const year = Number.isFinite(yearArg) ? yearArg : 2025;

  console.log(`[ingest] start command=${command} year=${year}`);

  let result: unknown;

  if (command === "single") {
    console.log(
      `[ingest] phase single-area started: deso=${arg1 ?? "123"} region=${arg2 ?? "Stockholm"}`,
    );
    result = await engine.ingestAll(arg1 ?? "123", arg2 ?? "Stockholm", year);
    console.log("[ingest] phase single-area done");
  } else if (command === "all-areas") {
    const areaYear = Number.parseInt(arg1 ?? "2025", 10);
    const resolvedYear = Number.isFinite(areaYear) ? areaYear : 2025;
    console.log(`[ingest] phase all-areas started: year=${resolvedYear}`);
    result = await engine.ingestAllStockholmAreas({
      year: resolvedYear,
    });
    console.log("[ingest] phase all-areas done");
  } else if (command === "full-backfill") {
    console.log(`[ingest] phase all-areas started: year=${year}`);
    const areaResult = await engine.ingestAllStockholmAreas({ year });
    console.log("[ingest] phase all-areas done");
    console.log(`[ingest] phase all-districts started: year=${year}`);
    const districtResult = await engine.ingestAllDistricts({ year });
    console.log("[ingest] phase all-districts done");
    result = {
      status: "complete",
      scope: "full-backfill",
      year,
      areas: areaResult,
      districts: districtResult,
    };
  } else if (command === "all-districts-future") {
    console.log("[ingest] phase all-districts-future started");
    result = await engine.ingestFutureProjectsForAllDistricts();
    console.log("[ingest] phase all-districts-future done");
  } else if (command === "all-districts-schools") {
    console.log("[ingest] phase all-districts-schools started");
    result = await engine.ingestSchoolsForAllDistricts();
    console.log("[ingest] phase all-districts-schools done");
  } else if (command === "named-district-schools") {
    const namedDistrictId = arg1 ?? "";
    const radiusArg = Number.parseInt(arg2 ?? "3500", 10);
    const radiusMeters = Number.isFinite(radiusArg) ? radiusArg : 3500;
    console.log(
      `[ingest] phase named-district-schools started: district=${namedDistrictId} radius=${radiusMeters}`,
    );
    result = await engine.ingestSchoolsForNamedDistrict(namedDistrictId, { radiusMeters });
    console.log("[ingest] phase named-district-schools done");
  } else if (command === "seeded-named-districts-schools") {
    const radiusArg = Number.parseInt(arg1 ?? "4000", 10);
    const radiusMeters = Number.isFinite(radiusArg) ? radiusArg : 4000;
    const municipality = arg2?.trim() ? String(arg2).trim() : null;
    console.log(
      `[ingest] phase seeded-named-districts-schools started: radius=${radiusMeters}${municipality ? ` muni=${municipality}` : ""}`,
    );
    const districtsRes = await pool.query(
      `SELECT id
       FROM named_districts
       WHERE source_type = 'seeded_centroid'
         AND legacy_district_id IS NOT NULL
         AND ($1::varchar IS NULL OR source_municipality_code = $1)
       ORDER BY source_municipality_code ASC, id ASC`,
      [municipality],
    );
    const items = districtsRes.rows.map((r: { id: unknown }) => String(r.id));
    const perDistrict: Array<{ id: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const id of items) {
      try {
        const r = await engine.ingestSchoolsForNamedDistrict(id, { radiusMeters });
        perDistrict.push({ id, ok: true, result: r });
      } catch (err) {
        perDistrict.push({ id, ok: false, error: String((err as Error)?.message ?? err) });
      }
    }
    result = {
      status: "ok",
      scope: "seeded-named-districts-schools",
      radiusMeters,
      municipality,
      total: items.length,
      districts: perDistrict,
    };
    console.log("[ingest] phase seeded-named-districts-schools done");
  } else if (command === "all-districts-full") {
    console.log(`[ingest] phase all-districts started: year=${year}`);
    result = await engine.ingestAllDistricts({ year });
    console.log("[ingest] phase all-districts done");
  } else {
    console.log(`[ingest] phase all-areas started: year=${year}`);
    const areaResult = await engine.ingestAllStockholmAreas({ year });
    console.log("[ingest] phase all-areas done");
    console.log(`[ingest] phase all-districts started: year=${year}`);
    const districtResult = await engine.ingestAllDistricts({ year });
    console.log("[ingest] phase all-districts done");
    result = {
      status: "complete",
      scope: "full-backfill",
      year,
      areas: areaResult,
      districts: districtResult,
    };
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[ingest] complete in ${elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`}`,
  );
  console.log("Ingestion complete:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

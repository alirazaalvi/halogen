import { pool } from "../../db/connection";
import { IngestionEngine } from "./engine";
import type { RunRecorder } from "./run-recorder";

/** Stores the run outcome. Never lets bookkeeping failures hide the ingestion result. */
async function persistRun(command: string, recorder: RunRecorder): Promise<void> {
  try {
    const run = await pool.query(
      `INSERT INTO ingestion_runs (command, status, finished_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [command, recorder.status()],
    );
    const runId = run.rows[0]?.id;
    for (const step of recorder.steps()) {
      await pool.query(
        `INSERT INTO ingestion_steps (run_id, source, status, rows_written, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          runId,
          step.source,
          step.status,
          step.rowsWritten,
          `x${step.occurrences}${step.messages.length > 0 ? `: ${step.messages.join("; ")}` : ""}`,
        ],
      );
    }
  } catch (error) {
    console.warn(
      `[ingest] could not record run (is migration 019 applied?): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

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
  } else if (command === "rescore") {
    console.log("[ingest] phase rescore started (no network)");
    result = await engine.rescoreAllAreas(year);
    console.log("[ingest] phase rescore done");
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
  } else if (command === "verify-named-district-schools") {
    const municipality = arg1?.trim() ? String(arg1).trim() : null;
    const geometryBufferArg = Number.parseInt(arg2 ?? "150", 10);
    const districtRadiusArg = Number.parseInt(arg3 ?? "4000", 10);
    const geometryBufferMeters = Number.isFinite(geometryBufferArg) ? geometryBufferArg : 150;
    const districtRadiusMeters = Number.isFinite(districtRadiusArg) ? districtRadiusArg : 4000;
    console.log(
      `[ingest] phase verify-named-district-schools started${municipality ? `: muni=${municipality}` : ""} geometryBuffer=${geometryBufferMeters} districtRadius=${districtRadiusMeters}`,
    );
    result = await engine.verifyNamedDistrictSchoolCoverage({
      municipalityCode: municipality,
      geometryBufferMeters,
      districtRadiusMeters,
    });
    console.log("[ingest] phase verify-named-district-schools done");
  } else if (command === "fix-remaining-named-district-schools") {
    const minSchoolsArg = Number.parseInt(arg1 ?? "1", 10);
    const minSchoolRows = Number.isFinite(minSchoolsArg) ? minSchoolsArg : 1;
    const ingestRadiusArg = Number.parseInt(arg2 ?? "4000", 10);
    const ingestRadiusMeters = Number.isFinite(ingestRadiusArg) ? ingestRadiusArg : 4000;
    const municipalitiesRaw = arg3?.trim() ? String(arg3).trim() : "";
    const municipalityCodes = municipalitiesRaw
      ? municipalitiesRaw
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean)
      : undefined;
    console.log(
      `[ingest] phase fix-remaining-named-district-schools started: minSchools=${minSchoolRows} ingestRadius=${ingestRadiusMeters}${municipalityCodes ? ` muni=${municipalityCodes.join(",")}` : ""}`,
    );
    result = await engine.fixRemainingNamedDistrictSchools({
      municipalityCodes,
      minSchoolRows,
      ingestRadiusMeters,
    });
    console.log("[ingest] phase fix-remaining-named-district-schools done");
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

  await persistRun(command, engine.recorder);
  console.log(`[ingest] run summary (${engine.recorder.status()}):\n${engine.recorder.summary()}`);

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[ingest] complete in ${elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`}`,
  );
  console.log("Ingestion complete:", result);
  // Non-zero when any step failed, so schedulers and CI notice (DR-22).
  process.exit(engine.recorder.exitCode());
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

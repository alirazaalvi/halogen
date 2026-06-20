import { IngestionEngine } from "./engine";

async function main() {
  const engine = new IngestionEngine();

  const command = process.argv[2] ?? "full-backfill";
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];
  const arg3 = process.argv[5];

  const yearArg = Number.parseInt(arg1 ?? arg3 ?? "2025", 10);
  const year = Number.isFinite(yearArg) ? yearArg : 2025;

  console.log("Starting data ingestion...");

  let result: unknown;

  if (command === "single") {
    result = await engine.ingestAll(arg1 ?? "123", arg2 ?? "Stockholm", year);
  } else if (command === "all-areas") {
    const areaYear = Number.parseInt(arg1 ?? "2025", 10);
    result = await engine.ingestAllStockholmAreas({
      year: Number.isFinite(areaYear) ? areaYear : 2025,
    });
  } else if (command === "full-backfill") {
    const areaResult = await engine.ingestAllStockholmAreas({ year });
    const districtResult = await engine.ingestAllDistricts({ year });
    result = {
      status: "complete",
      scope: "full-backfill",
      year,
      areas: areaResult,
      districts: districtResult,
    };
  } else if (command === "all-districts-future") {
    result = await engine.ingestFutureProjectsForAllDistricts();
  } else if (command === "all-districts-schools") {
    result = await engine.ingestSchoolsForAllDistricts();
  } else if (command === "all-districts-full") {
    result = await engine.ingestAllDistricts({ year });
  } else {
    const areaResult = await engine.ingestAllStockholmAreas({ year });
    const districtResult = await engine.ingestAllDistricts({ year });
    result = {
      status: "complete",
      scope: "full-backfill",
      year,
      areas: areaResult,
      districts: districtResult,
    };
  }

  console.log("Ingestion complete:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});

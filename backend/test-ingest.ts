import { IngestionEngine } from "./src/lib/ingestion/engine";

async function testIngest() {
  const engine = new IngestionEngine();
  const districtId = "STH-RINKEBY";
  const year = 2025;

  console.log("Testing ingestDemographicsForDistrict...");
  await engine.ingestDemographicsForDistrict(districtId, year);
  console.log("✅ ingestDemographicsForDistrict done");

  console.log("Testing ingestSchoolsForDistrict...");
  await engine.ingestSchoolsForDistrict(districtId, "0180");
  console.log("✅ ingestSchoolsForDistrict done");

  console.log("Testing ingestMunicipalOpenDataForDistrict...");
  await engine.ingestMunicipalOpenDataForDistrict(districtId, "Stockholm");
  console.log("✅ ingestMunicipalOpenDataForDistrict done");

  console.log("Testing calculateDistrictScore...");
  await engine.calculateDistrictScore(districtId, year);
  console.log("✅ calculateDistrictScore done");
}

testIngest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

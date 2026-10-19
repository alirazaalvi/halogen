/**
 * End-to-end check of the ingestion against a real PostGIS database, with the external
 * APIs replaced by canned responses. Skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgresql://... bun test test/
 *
 * The database must have all migrations applied and is modified (use a scratch database).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const A = "0180C1010";
const B = "0180C1020";

// Two 0.02-degree squares near Kista.
const squareA = { type: "Polygon", coordinates: [[[17.93, 59.40], [17.95, 59.40], [17.95, 59.42], [17.93, 59.42], [17.93, 59.40]]] };
const squareB = { type: "Polygon", coordinates: [[[17.95, 59.40], [17.97, 59.40], [17.97, 59.42], [17.95, 59.42], [17.95, 59.40]]] };

type Mode = { scb: "ok" | "error"; trafiklab: "ok" | "error" };
const mode: Mode = { scb: "ok", trafiklab: "ok" };
const calls: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function schoolDetail(code: string, name: string, geo?: { lat: number; lng: number }) {
  return {
    data: {
      attributes: {
        schoolUnitCode: code,
        displayName: name,
        status: "AKTIV",
        municipalityCode: "0180",
        addresses: geo
          ? [
              {
                type: "BESOKSADRESS",
                streetAddress: `${name}gatan 1`,
                postalCode: "16440",
                locality: "Kista",
                geoCoordinates: { latitude: geo.lat, longitude: geo.lng },
              },
            ]
          : [],
      },
    },
  };
}

const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const u = String(input);
  calls.push(`${init?.method ?? "GET"} ${u.split("?")[0]}`);

  if (u.includes("FolkmDesoAldKon")) {
    if (mode.scb === "error") return json({ error: "boom" }, 500);
    if (init?.method === "POST") {
      const q = JSON.parse(String(init.body)).query as Array<{ code: string; selection: { values: string[] } }>;
      const regions = q.find((x) => x.code === "Region")?.selection.values ?? [];
      const periods = q.find((x) => x.code === "Tid")?.selection.values ?? [];
      const pop: Record<string, Record<string, number>> = {
        [A]: { "2024": 1000, "2025": 1200 },
        [B]: { "2024": 800, "2025": 800 },
      };
      return json({
        id: ["Region", "ContentsCode", "Tid"],
        size: [regions.length, 1, periods.length],
        dimension: {
          Region: { category: { index: Object.fromEntries(regions.map((r, i) => [r, i])) } },
          ContentsCode: { category: { index: { BE0101A9: 0 } } },
          Tid: { category: { index: Object.fromEntries(periods.map((p, i) => [p, i])) } },
        },
        value: regions.flatMap((r) => periods.map((p) => pop[r]?.[p] ?? null)),
      });
    }
    return json({
      title: "Population per region",
      variables: [
        { code: "Region", values: [A, B] },
        { code: "Alder", values: ["tot"], elimination: true },
        { code: "Kon", values: ["1", "2"], elimination: true },
        { code: "ContentsCode", values: ["BE0101A9"] },
        { code: "Tid", values: ["2023", "2024", "2025"], time: true },
      ],
    });
  }

  if (u.includes("skolenhetsregistret")) {
    const code = u.split("/").pop() ?? "";
    if (u.includes("municipality_code=")) {
      return json({
        data: {
          attributes: ["S1", "S2", "S3", "S4"].map((c) => ({ schoolUnitCode: c, status: "AKTIV" })),
        },
      });
    }
    const details: Record<string, ReturnType<typeof schoolDetail>> = {
      S1: schoolDetail("S1", "Kistaskolan", { lat: 59.41, lng: 17.94 }), // inside A
      S2: schoolDetail("S2", "Husbyskolan", { lat: 59.41, lng: 17.96 }), // inside B
      S3: schoolDetail("S3", "Okaend skola"), // no address, no coordinates
      S4: schoolDetail("S4", "Fjarran skola", { lat: 59.9, lng: 18.9 }), // outside both
    };
    return details[code] ? json(details[code]) : json({}, 404);
  }

  if (u.includes("resrobot")) {
    if (mode.trafiklab === "error") return json({ error: "boom" }, 500);
    const stop = (id: string | undefined, lat: number, lon: number, products: number) => ({
      StopLocation: { extId: id, name: `Stop ${id}`, lat, lon, productAtStop: Array.from({ length: products }, () => ({})) },
    });
    return json({
      stopLocationOrCoordLocation: [
        stop("T1", 59.41, 17.94, 2), // inside A
        stop("T2", 59.41, 17.96, 4), // inside B
        stop(undefined, 59.41, 17.94, 3), // no id: must be skipped
      ],
    });
  }

  throw new Error(`Unexpected network call in test: ${u}`);
};

describe.skipIf(!url)("ingestion end to end (PostGIS)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic imports after DATABASE_URL is set
  let pool: any;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  let engine: any;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.TRAFIKLAB_API_KEY = "test-key";
    globalThis.fetch = mockFetch as typeof fetch;
    pool = (await import("../src/db/connection")).pool;
    const { IngestionEngine } = await import("../src/lib/ingestion/engine");
    engine = new IngestionEngine();

    await pool.query(`TRUNCATE demographics, schools, transport_stops, crime_stats, future_projects,
      addresses, environmental_data, neighborhood_scores, ingestion_steps, ingestion_runs CASCADE`);
    await pool.query(`DELETE FROM deso_areas WHERE id IN ('${A}','${B}')`);
    for (const [id, geom] of [[A, squareA], [B, squareB]] as const) {
      await pool.query(
        `INSERT INTO deso_areas (id, name, geometry, centroid)
         VALUES ($1, $1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
                 ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)))`,
        [id, JSON.stringify(geom)],
      );
    }
    for (const id of [A, B]) await engine.ingestAll(id, "Stockholm", 2025, `Test ${id}`);
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test("stores SCB population and growth, and nothing it did not receive", async () => {
    const { rows } = await pool.query(
      `SELECT deso_id, year, population_total, population_growth, median_income, higher_edu_pct,
              foreign_born_pct, families_with_kids_pct, quality
       FROM demographics WHERE deso_id IN ('${A}','${B}') ORDER BY deso_id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ deso_id: A, year: 2025, population_total: "1200", quality: "measured" });
    expect(Number(rows[0].population_growth)).toBe(20);
    expect(Number(rows[1].population_growth)).toBe(0);
    for (const r of rows) {
      expect(r.median_income).toBeNull();
      expect(r.higher_edu_pct).toBeNull();
      expect(r.foreign_born_pct).toBeNull();
      expect(r.families_with_kids_pct).toBeNull();
    }
  });

  test("assigns schools to the area that contains them; drops unlocated and outside schools", async () => {
    const { rows } = await pool.query(
      `SELECT deso_id, name, performance, student_count, quality FROM schools ORDER BY name`,
    );
    expect(rows.map((r: { name: string; deso_id: string }) => [r.name, r.deso_id])).toEqual([
      ["Husbyskolan", B],
      ["Kistaskolan", A],
    ]);
    for (const r of rows) {
      expect(r.performance).toBeNull();
      expect(r.student_count).toBeNull();
      expect(r.quality).toBe("measured");
    }
  });

  test("stores only stops with an id, and counts them by location", async () => {
    const { rows } = await pool.query(`SELECT id, route_count FROM transport_stops ORDER BY id`);
    expect(rows.map((r: { id: string }) => r.id)).toEqual(["T1", "T2"]);
    const { rows: scores } = await pool.query(
      `SELECT deso_id, transport_score, overall_score, data_coverage, components_available, components_missing
       FROM neighborhood_scores WHERE deso_id IN ('${A}','${B}') ORDER BY deso_id`,
    );
    // A: 1 stop, 2 routes -> 2*14 + 8 = 36. B: 1 stop, 4 routes -> 4*14 + 8 = 64.
    expect(Number(scores[0].transport_score)).toBe(36);
    expect(Number(scores[1].transport_score)).toBe(64);
    expect(scores[0].overall_score).toBeNull(); // coverage 0.14 < 0.5
    expect(Number(scores[0].data_coverage)).toBeCloseTo(0.14, 2);
    expect(scores[0].components_available).toEqual(["transport"]);
    expect(scores[0].components_missing).toContain("schools");
  });

  test("a clean run is recorded as ok, with skipped sources named", () => {
    const steps = engine.recorder.steps() as Array<{ source: string; status: string }>;
    const status = (source: string) => steps.find((s) => s.source === source)?.status;
    expect(status("scb")).toBe("ok");
    expect(status("skolverket")).toBe("ok");
    expect(status("trafiklab")).toBe("ok");
    for (const skipped of ["bra", "smhi", "lantmateriet", "municipal_projects", "scb_indicators"]) {
      expect(status(skipped)).toBe("skipped");
    }
    expect(engine.recorder.status()).toBe("ok");
    expect(engine.recorder.exitCode()).toBe(0);
  });

  test("no generated or fallback rows exist anywhere", async () => {
    for (const table of ["demographics", "schools", "transport_stops", "crime_stats", "future_projects", "addresses", "environmental_data"]) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM ${table}
         WHERE quality IN ('synthetic', 'seed')
            OR raw_data->>'fallback' = 'true' OR raw_data->>'generated' = 'true'`,
      );
      expect(rows[0].n, table).toBe(0);
    }
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM crime_stats`)).rows[0].n).toBe(0);
  });

  test("a failing source writes nothing, keeps old data and fails the run", async () => {
    const { IngestionEngine } = await import("../src/lib/ingestion/engine");
    const failing = new IngestionEngine();
    mode.scb = "error";
    mode.trafiklab = "error";
    try {
      await failing.ingestAll(A, "Stockholm", 2025, "Test");
    } finally {
      mode.scb = "ok";
      mode.trafiklab = "ok";
    }
    const steps = failing.recorder.steps() as Array<{ source: string; status: string }>;
    expect(steps.find((s) => s.source === "scb")?.status).toBe("failed");
    expect(steps.find((s) => s.source === "trafiklab")?.status).toBe("failed");
    expect(failing.recorder.exitCode()).toBe(1);

    const { rows } = await pool.query(`SELECT population_total FROM demographics WHERE deso_id = '${A}'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].population_total).toBe("1200");
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM transport_stops`)).rows[0].n).toBe(2);
  });

  test("a missing Trafiklab key is skipped, not failed", async () => {
    const { IngestionEngine } = await import("../src/lib/ingestion/engine");
    const e = new IngestionEngine();
    const saved = process.env.TRAFIKLAB_API_KEY;
    process.env.TRAFIKLAB_API_KEY = "";
    try {
      await e.ingestAll(B, "Stockholm", 2025, "Test");
    } finally {
      process.env.TRAFIKLAB_API_KEY = saved;
    }
    const t = (e.recorder.steps() as Array<{ source: string; status: string; messages: string[] }>).find(
      (s) => s.source === "trafiklab",
    );
    expect(t).toMatchObject({ status: "skipped", messages: ["missing_api_key"] });
  });

  test("rescore and data checks run against PostGIS without errors", async () => {
    const result = await engine.rescoreAllAreas(2025);
    expect(result.withOverall).toBe(0);
    const { runDataChecks } = await import("../src/lib/quality/checks");
    const issues = await runDataChecks(pool);
    expect(issues.filter((i: { severity: string }) => i.severity === "error")).toEqual([]);
  });

  test("the API returns stored values and nulls, never invented ones", async () => {
    const { Hono } = await import("hono");
    const { mountRoutes } = await import("../src/lib/http/hono-adapter");
    const { neighborhoodRoutes } = await import("../src/modules/neighborhoods/neighborhood.routes");
    const app = new Hono();
    await mountRoutes(app, "/api", neighborhoodRoutes);

    const res = await app.request(`/api/neighborhood/${A}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: any };
    const d = body.data;
    expect(d.scores.overall).toBeNull();
    expect(d.scores.transport).toBe(36);
    expect(d.scores.schools).toBeNull();
    expect(d.scores.coverage).toBeCloseTo(0.14, 2);
    expect(d.details.commute).toBeNull();
    expect(d.details.demographics).toMatchObject({ population: 1200, growth: 20, medianIncome: null });
    expect(d.details.future).toEqual([]);
    expect(d.details.crimeStats).toEqual([]);
    expect(d.details.growthPrediction).toBeNull();
    const names = d.details.schools.map((s: { name: string }) => s.name);
    expect(names).toContain("Kistaskolan");
    for (const s of d.details.schools) {
      expect(s.performance).toBeNull();
      expect(s.students).toBeNull();
      expect(s.inspection).toBeNull();
    }
  });
});

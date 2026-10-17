import { describe, expect, test } from "bun:test";
import { checkFreshness, formatIssues, runDataChecks } from "./checks";

const now = new Date("2026-10-17T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("checkFreshness", () => {
  test("recent runs are fine", () => {
    const issues = checkFreshness(new Map([["trafiklab", daysAgo(3)]]), now, { trafiklab: 45 });
    expect(issues).toEqual([]);
  });
  test("stale source is an error", () => {
    const issues = checkFreshness(new Map([["trafiklab", daysAgo(60)]]), now, { trafiklab: 45 });
    expect(issues[0]).toMatchObject({ severity: "error", check: "freshness" });
  });
  test("never-run source is a warning", () => {
    const issues = checkFreshness(new Map(), now, { scb: 400 });
    expect(issues[0].severity).toBe("warn");
  });
});

describe("runDataChecks", () => {
  test("reports violations returned by the database as errors", async () => {
    const db = {
      query: async (sql: string) => {
        if (
          sql.includes("FROM demographics WHERE") &&
          sql.includes("percentages") === false &&
          sql.includes("higher_edu_pct NOT BETWEEN")
        ) {
          return { rows: [{ n: 3 }] };
        }
        if (sql.includes("total,")) return { rows: [{ total: 10, without_population: 0 }] };
        if (sql.includes("ingestion_steps")) return { rows: [] };
        return { rows: [{ n: 0 }] };
      },
    };
    const issues = await runDataChecks(db, now);
    const range = issues.find((i) => i.check === "demographics.percent_range");
    expect(range).toMatchObject({ severity: "error", count: 3 });
    expect(formatIssues(issues)).toContain("[error]");
  });

  test("no violations gives only freshness warnings", async () => {
    const db = {
      query: async (sql: string) =>
        sql.includes("total,")
          ? { rows: [{ total: 1, without_population: 0 }] }
          : sql.includes("ingestion_steps")
            ? { rows: [] }
            : { rows: [{ n: 0 }] },
    };
    const issues = await runDataChecks(db, now);
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
  });
});

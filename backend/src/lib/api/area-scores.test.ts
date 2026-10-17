import { describe, expect, test } from "bun:test";
import { publicScores } from "./area-scores";

describe("publicScores", () => {
  test("never invents values for an unscored area", () => {
    const s = publicScores({});
    expect(s.overall).toBeNull();
    expect(s.schools).toBeNull();
    expect(s.coverage).toBeNull();
    expect(s.missing).toContain("schools");
    expect(s.missing).not.toContain("overall");
  });

  test("handles undefined input", () => {
    expect(publicScores(undefined).overall).toBeNull();
  });

  test("keeps real values, rounds to one decimal and reports coverage", () => {
    const s = publicScores({
      overallScore: "71.234",
      transportScore: 60,
      dataCoverage: "0.56",
      scoringVersion: "2.0.0",
    });
    expect(s.overall).toBe(71.2);
    expect(s.transport).toBe(60);
    expect(s.coverage).toBe(0.56);
    expect(s.scoringVersion).toBe("2.0.0");
    expect(s.missing).not.toContain("transport");
  });

  test("a zero score is a value, not missing", () => {
    expect(publicScores({ safetyScore: 0 }).safety).toBe(0);
  });
});

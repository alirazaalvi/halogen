import { describe, expect, test } from "bun:test";
import { chatReply, summary } from "./describe";

describe("ai describe", () => {
  test("never fills in missing scores or recommends", () => {
    const reply = chatReply({
      message: "should I buy?",
      context: { name: "Kista", scores: { overall: null, schools: null, transport: 61.2 } },
    });
    expect(reply).toContain("no overall score");
    expect(reply).toContain("Transport: 61/100");
    expect(reply).toContain("No data yet for: Schools");
    expect(reply).toContain("can't give a buy");
  });

  test("works without context", () => {
    expect(chatReply({ message: "hi" })).toContain("Tell me which area");
  });

  test("summary has no verdict", () => {
    const s = summary({ name: "Kista", region: "Stockholm", scores: { overall: 72.4 } });
    expect(s.summary).toBe("Kista in Stockholm scores 72/100 overall.");
    expect(s.recommendation).toBeNull();
  });
});

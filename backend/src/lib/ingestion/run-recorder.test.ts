import { describe, expect, test } from "bun:test";
import { outcomeFromResult, RunRecorder } from "./run-recorder";

describe("RunRecorder", () => {
  test("all ok -> ok, exit 0", () => {
    const r = new RunRecorder();
    r.record({ source: "scb", status: "ok", rowsWritten: 2 });
    r.record({ source: "crime", status: "skipped", message: "no_source" });
    expect(r.status()).toBe("ok");
    expect(r.exitCode()).toBe(0);
  });

  test("any failure -> partial, exit 1", () => {
    const r = new RunRecorder();
    r.record({ source: "scb", status: "ok" });
    r.record({ source: "transport", status: "failed", message: "boom" });
    expect(r.status()).toBe("partial");
    expect(r.exitCode()).toBe(1);
  });

  test("only failures -> failed", () => {
    const r = new RunRecorder();
    r.record({ source: "scb", status: "failed" });
    expect(r.status()).toBe("failed");
  });

  test("aggregates by source and status, caps and de-duplicates messages", () => {
    const r = new RunRecorder();
    for (let i = 0; i < 20; i += 1) {
      r.record({ source: "scb", status: "failed", message: `err ${i % 8}`, rowsWritten: 0 });
    }
    const [step] = r.steps();
    expect(step.occurrences).toBe(20);
    expect(step.messages.length).toBe(5);
  });

  test("outcomeFromResult maps statuses", () => {
    expect(outcomeFromResult("x", { status: "skipped", reason: "r" })).toMatchObject({
      status: "skipped",
      message: "r",
    });
    expect(outcomeFromResult("x", { status: "ok", count: 3 })).toMatchObject({
      status: "ok",
      rowsWritten: 3,
    });
    expect(outcomeFromResult("x", null).status).toBe("failed");
  });
});

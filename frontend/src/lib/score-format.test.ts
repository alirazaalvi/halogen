import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDisplayScore, formatOrDash, normalizeDisplayScore } from "./score-format.ts";

test("missing scores are not shown as zero", () => {
  assert.equal(normalizeDisplayScore(null), null);
  assert.equal(normalizeDisplayScore(undefined), null);
  assert.equal(normalizeDisplayScore(""), null);
  assert.equal(formatDisplayScore(null), "-");
});

test("real values, including zero, are shown", () => {
  assert.equal(formatDisplayScore(0), "0");
  assert.equal(formatDisplayScore("71.6"), "72");
});

test("formatOrDash", () => {
  assert.equal(formatOrDash(null), "-");
  assert.equal(formatOrDash(0), "0");
  assert.equal(
    formatOrDash(1500, (n) => `${n / 1000}k`),
    "1.5k",
  );
});

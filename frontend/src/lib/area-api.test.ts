import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAreaDetails, slugQueryVariants, toNumberOrNull } from "./area-api.ts";

test("toNumberOrNull keeps null as null", () => {
  assert.equal(toNumberOrNull(null), null);
  assert.equal(toNumberOrNull(undefined), null);
  assert.equal(toNumberOrNull(""), null);
  assert.equal(toNumberOrNull("12.5"), 12.5);
  assert.equal(toNumberOrNull(0), 0);
});

test("an unscored area yields nulls, not defaults", () => {
  const area = normalizeAreaDetails(
    {
      area: { id: "ND-1", name: "Kista", municipality: "Stockholm", coordinates: {} },
      scores: { overall: null, schools: null, coverage: 0, missing: ["schools"] },
      details: { schools: [], demographics: null, crimeStats: [], growthPrediction: null },
    },
    "kista",
  );
  assert.ok(area);
  assert.equal(area.overall, null);
  assert.equal(area.scores.schools, null);
  assert.equal(area.coords, null);
  assert.equal(area.demographics, null);
  assert.equal(area.growthPrediction, null);
  assert.deepEqual(area.missingScores, ["schools"]);
});

test("school with unknown results keeps nulls", () => {
  const area = normalizeAreaDetails(
    {
      area: { id: "ND-1", name: "Kista" },
      scores: {},
      details: {
        schools: [
          { name: "A", distance: "1 km", walkMin: null, students: null, performance: null },
        ],
      },
    },
    "kista",
  );
  assert.ok(area);
  assert.equal(area.schools[0].performance, null);
  assert.equal(area.schools[0].students, null);
  assert.equal(area.schools[0].walkMin, null);
});

test("returns null when the payload has no area", () => {
  assert.equal(normalizeAreaDetails({}, "x"), null);
});

test("slug variants include Swedish letters", () => {
  assert.ok(slugQueryVariants("sodermalm").includes("södermalm"));
  assert.ok(slugQueryVariants("kista").includes("kista"));
});

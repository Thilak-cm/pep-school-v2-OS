import test from "node:test";
import assert from "node:assert/strict";
import {
  PROGRAM_DIMENSIONS,
  VALID_PROGRAMS,
  VALID_TRENDS,
  VALID_SOURCE_TYPES,
  PROFILE_MODEL,
} from "../config/profileConstants.js";

// ---------------------------------------------------------------------------
// Dimension config validation
// ---------------------------------------------------------------------------

test("PROGRAM_DIMENSIONS covers all four programs", () => {
  assert.deepStrictEqual(VALID_PROGRAMS.sort(), ["adolescent", "elementary", "primary", "toddler"]);
});

test("Toddler and Primary share the same dimension set", () => {
  assert.deepStrictEqual(PROGRAM_DIMENSIONS.toddler, PROGRAM_DIMENSIONS.primary);
});

test("Each program has the expected dimension count", () => {
  assert.equal(PROGRAM_DIMENSIONS.toddler.length, 7, "toddler should have 7 dimensions");
  assert.equal(PROGRAM_DIMENSIONS.primary.length, 7, "primary should have 7 dimensions");
  assert.equal(PROGRAM_DIMENSIONS.elementary.length, 7, "elementary should have 7 dimensions");
  assert.equal(PROGRAM_DIMENSIONS.adolescent.length, 9, "adolescent should have 9 dimensions");
});

test("Dimension keys are unique within each program", () => {
  for (const program of VALID_PROGRAMS) {
    const keys = PROGRAM_DIMENSIONS[program].map((d) => d.key);
    const unique = new Set(keys);
    assert.equal(keys.length, unique.size, `${program} has duplicate dimension keys`);
  }
});

test("Every dimension has required fields", () => {
  for (const program of VALID_PROGRAMS) {
    for (const dim of PROGRAM_DIMENSIONS[program]) {
      assert.ok(dim.key, `${program}: dimension missing key`);
      assert.ok(dim.label, `${program}/${dim.key}: missing label`);
      assert.ok(dim.description, `${program}/${dim.key}: missing description`);
      assert.ok(["major", "good_to_have"].includes(dim.priority), `${program}/${dim.key}: invalid priority "${dim.priority}"`);
      assert.ok(typeof dim.order === "number" && dim.order > 0, `${program}/${dim.key}: invalid order`);
    }
  }
});

test("Orders are sequential within each program", () => {
  for (const program of VALID_PROGRAMS) {
    const orders = PROGRAM_DIMENSIONS[program].map((d) => d.order);
    const expected = Array.from({ length: orders.length }, (_, i) => i + 1);
    assert.deepStrictEqual(orders, expected, `${program} dimension orders not sequential`);
  }
});

// ---------------------------------------------------------------------------
// Profile model constant validation
// ---------------------------------------------------------------------------

test("PROFILE_MODEL is a frontier model", () => {
  assert.ok(PROFILE_MODEL, "PROFILE_MODEL should be defined");
  assert.ok(!PROFILE_MODEL.includes("mini"), "PROFILE_MODEL should not be a mini model");
  assert.ok(!PROFILE_MODEL.includes("nano"), "PROFILE_MODEL should not be a nano model");
});

test("VALID_TRENDS has expected values", () => {
  assert.deepStrictEqual(VALID_TRENDS, ["emerging", "developing", "stable", "declining"]);
});

test("VALID_SOURCE_TYPES has expected values", () => {
  assert.deepStrictEqual(VALID_SOURCE_TYPES, ["backfill", "interview", "observation"]);
});

// ---------------------------------------------------------------------------
// parseProfileResponse validation
// ---------------------------------------------------------------------------

test("parseProfileResponse extracts valid dimensions", async () => {
  const { parseProfileResponse } = await import("../utils/profileHelpers.js");
  const dimensions = PROGRAM_DIMENSIONS.primary;
  const rawResponse = {};
  for (const dim of dimensions) {
    rawResponse[dim.key] = {
      narrative: `Test narrative for ${dim.label}`,
      confidence: 0.7,
      evidenceCount: 10,
      trend: "developing",
    };
  }

  const result = parseProfileResponse(rawResponse, dimensions);
  assert.equal(result.length, 7);
  for (const entry of result) {
    assert.ok(entry.dimensionKey, "entry missing dimensionKey");
    assert.ok(entry.narrative, "entry missing narrative");
    assert.ok(typeof entry.structuredSignals.confidence === "number");
    assert.ok(typeof entry.structuredSignals.evidenceCount === "number");
    assert.ok(VALID_TRENDS.includes(entry.structuredSignals.trend));
  }
});

test("parseProfileResponse handles missing dimensions gracefully", async () => {
  const { parseProfileResponse } = await import("../utils/profileHelpers.js");
  const dimensions = PROGRAM_DIMENSIONS.primary;
  // Only provide 3 out of 7 dimensions
  const rawResponse = {
    independence_practical_life: {
      narrative: "Test",
      confidence: 0.5,
      evidenceCount: 3,
      trend: "emerging",
    },
    social_emotional: {
      narrative: "Test",
      confidence: 0.6,
      evidenceCount: 5,
      trend: "developing",
    },
    language_literacy: {
      narrative: "Test",
      confidence: 0.4,
      evidenceCount: 2,
      trend: "emerging",
    },
  };

  const result = parseProfileResponse(rawResponse, dimensions);
  // Should return all 7 — missing ones get default narrative
  assert.equal(result.length, 7);
  const missing = result.filter((r) => r.structuredSignals.confidence === 0);
  assert.equal(missing.length, 4, "4 dimensions should have zero confidence (no data)");
});

test("parseProfileResponse clamps confidence to 0-1", async () => {
  const { parseProfileResponse } = await import("../utils/profileHelpers.js");
  const dimensions = [PROGRAM_DIMENSIONS.primary[0]];
  const rawResponse = {
    independence_practical_life: {
      narrative: "Test",
      confidence: 1.5,
      evidenceCount: 10,
      trend: "developing",
    },
  };

  const result = parseProfileResponse(rawResponse, dimensions);
  assert.equal(result[0].structuredSignals.confidence, 1, "confidence should be clamped to 1");
});

test("parseProfileResponse defaults invalid trend to 'emerging'", async () => {
  const { parseProfileResponse } = await import("../utils/profileHelpers.js");
  const dimensions = [PROGRAM_DIMENSIONS.primary[0]];
  const rawResponse = {
    independence_practical_life: {
      narrative: "Test",
      confidence: 0.5,
      evidenceCount: 5,
      trend: "invalid_trend",
    },
  };

  const result = parseProfileResponse(rawResponse, dimensions);
  assert.equal(result[0].structuredSignals.trend, "emerging", "invalid trend should default to 'emerging'");
});

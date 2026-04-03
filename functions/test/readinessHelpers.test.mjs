import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseReadinessResponse,
  clampScore,
  getReadinessPromptDocId,
} from "../utils/reportHelpers.js";

describe("parseReadinessResponse", () => {
  it("extracts all fields from a well-formed JSON response", () => {
    const raw = JSON.stringify({
      sentimentScore: 4,
      areaBalanceScore: 3,
      missingInputFlags: ["Hindi inputs missing"],
    });
    const result = parseReadinessResponse(raw);
    assert.equal(result.sentimentScore, 4);
    assert.equal(result.areaBalanceScore, 3);
    assert.deepEqual(result.missingInputFlags, ["Hindi inputs missing"]);
  });

  it("clamps scores to 1-5 range", () => {
    const raw = JSON.stringify({
      sentimentScore: 7,
      areaBalanceScore: 0,
      missingInputFlags: [],
    });
    const result = parseReadinessResponse(raw);
    assert.equal(result.sentimentScore, 5);
    assert.equal(result.areaBalanceScore, 1);
  });

  it("returns null for missing scores", () => {
    const raw = JSON.stringify({
      missingInputFlags: ["No data"],
    });
    const result = parseReadinessResponse(raw);
    assert.equal(result.sentimentScore, null);
    assert.equal(result.areaBalanceScore, null);
  });

  it("returns empty array when missingInputFlags is absent", () => {
    const raw = JSON.stringify({
      sentimentScore: 3,
      areaBalanceScore: 4,
    });
    const result = parseReadinessResponse(raw);
    assert.deepEqual(result.missingInputFlags, []);
  });

  it("filters out non-string entries from missingInputFlags", () => {
    const raw = JSON.stringify({
      sentimentScore: 3,
      areaBalanceScore: 3,
      missingInputFlags: ["Valid flag", 123, null, "Another flag"],
    });
    const result = parseReadinessResponse(raw);
    assert.deepEqual(result.missingInputFlags, ["Valid flag", "Another flag"]);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseReadinessResponse("not json"), {
      message: /Failed to parse readiness response/,
    });
  });

  it("handles empty JSON object gracefully", () => {
    const raw = JSON.stringify({});
    const result = parseReadinessResponse(raw);
    assert.equal(result.sentimentScore, null);
    assert.equal(result.areaBalanceScore, null);
    assert.deepEqual(result.missingInputFlags, []);
  });
});

describe("clampScore", () => {
  it("returns value as-is when within 1-5", () => {
    assert.equal(clampScore(3), 3);
  });

  it("clamps to 5 when above range", () => {
    assert.equal(clampScore(10), 5);
  });

  it("clamps to 1 when below range", () => {
    assert.equal(clampScore(-2), 1);
  });

  it("rounds to nearest integer", () => {
    assert.equal(clampScore(3.7), 4);
    assert.equal(clampScore(2.2), 2);
  });

  it("returns null for non-number", () => {
    assert.equal(clampScore("3"), null);
    assert.equal(clampScore(null), null);
    assert.equal(clampScore(undefined), null);
  });

  it("returns null for NaN/Infinity", () => {
    assert.equal(clampScore(NaN), null);
    assert.equal(clampScore(Infinity), null);
  });
});

describe("getReadinessPromptDocId", () => {
  it("returns correct doc ID for adolescent", () => {
    assert.equal(getReadinessPromptDocId("adolescent"), "readiness_adolescent");
  });

  it("returns correct doc ID for elementary", () => {
    assert.equal(getReadinessPromptDocId("elementary"), "readiness_elementary");
  });

  it("returns correct doc ID for primary", () => {
    assert.equal(getReadinessPromptDocId("primary"), "readiness_primary");
  });

  it("returns correct doc ID for toddler", () => {
    assert.equal(getReadinessPromptDocId("toddler"), "readiness_toddler");
  });

  it("returns null for unsupported program", () => {
    assert.equal(getReadinessPromptDocId("unknown"), null);
  });

  it("returns null for empty/null input", () => {
    assert.equal(getReadinessPromptDocId(""), null);
    assert.equal(getReadinessPromptDocId(null), null);
    assert.equal(getReadinessPromptDocId(undefined), null);
  });
});

/**
 * PEP-222: Tests for soul/open_questions missing-data detection.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isMissingSoulData } from "./soulCheckHelpers.js";

describe("isMissingSoulData", () => {
  it("returns false when context is null (not loaded yet)", () => {
    assert.equal(isMissingSoulData(null), false);
  });

  it("returns true when soul is null", () => {
    assert.equal(isMissingSoulData({ soul: null, openQuestions: { area1: ["q1"] } }), true);
  });

  it("returns true when soul is empty string", () => {
    assert.equal(isMissingSoulData({ soul: "", openQuestions: { area1: ["q1"] } }), true);
  });

  it("returns true when openQuestions is null", () => {
    assert.equal(isMissingSoulData({ soul: "some content", openQuestions: null }), true);
  });

  it("returns true when openQuestions is empty object", () => {
    assert.equal(isMissingSoulData({ soul: "some content", openQuestions: {} }), true);
  });

  it("returns false when both soul and openQuestions have content", () => {
    assert.equal(isMissingSoulData({ soul: "narrative", openQuestions: { area1: ["q1", "q2"] } }), false);
  });

  it("returns true when soul exists but openQuestions is missing", () => {
    assert.equal(isMissingSoulData({ soul: "narrative", openQuestions: null }), true);
  });

  it("returns true when openQuestions exists but soul is missing", () => {
    assert.equal(isMissingSoulData({ soul: null, openQuestions: { area1: ["q1"] } }), true);
  });
});

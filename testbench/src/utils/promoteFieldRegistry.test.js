/**
 * Tests for promoteFieldRegistry (PEP-326).
 *
 * Run: node --test testbench/src/utils/promoteFieldRegistry.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPromotableFields, buildFieldDiff, PROMOTABLE_FIELDS } from "./promoteFieldRegistry.js";

describe("getPromotableFields", () => {
  it("returns fields for all 5 features", () => {
    const ids = ["handwriting_analysis", "soul_generation", "interview_question_gen", "monthly_plan", "digest_generation"];
    for (const id of ids) {
      const result = getPromotableFields(id);
      assert.ok(result.fields.length > 0, `${id} should have fields`);
    }
  });

  it("throws for unknown featureId", () => {
    assert.throws(() => getPromotableFields("bogus"), /Unknown featureId/);
  });

  it("handwriting_analysis requires programId", () => {
    assert.equal(getPromotableFields("handwriting_analysis").requiresProgramId, true);
  });

  it("digest_generation requires promptType", () => {
    assert.equal(getPromotableFields("digest_generation").requiresPromptType, true);
  });

  it("soul_generation includes guidelinesContent with warnIfFromStudent", () => {
    const { fields } = getPromotableFields("soul_generation");
    const gc = fields.find((f) => f.key === "guidelinesContent");
    assert.ok(gc, "guidelinesContent field should exist");
    assert.equal(gc.warnIfFromStudent, true);
  });

  it("monthly_plan has 4 standard fields", () => {
    const { fields } = getPromotableFields("monthly_plan");
    assert.equal(fields.length, 4);
    assert.deepEqual(fields.map((f) => f.key), ["systemPrompt", "model", "temperature", "max_tokens"]);
  });
});

describe("buildFieldDiff", () => {
  it("returns diff entries with changed flag", () => {
    const live = { systemPrompt: "old", model: "gpt-4o", temperature: 0.3, max_tokens: 2000 };
    const variant = { systemPrompt: "new", model: "gpt-4o", temperature: 0.5, max_tokens: 2000 };
    const diff = buildFieldDiff("monthly_plan", live, variant);

    assert.equal(diff.length, 4);
    assert.equal(diff[0].key, "systemPrompt");
    assert.equal(diff[0].changed, true);
    assert.equal(diff[0].liveValue, "old");
    assert.equal(diff[0].variantValue, "new");

    assert.equal(diff[1].key, "model");
    assert.equal(diff[1].changed, false);

    assert.equal(diff[2].key, "temperature");
    assert.equal(diff[2].changed, true);
  });

  it("handles null live config (new doc)", () => {
    const diff = buildFieldDiff("monthly_plan", null, { systemPrompt: "new" });
    assert.equal(diff[0].liveValue, null);
    assert.equal(diff[0].variantValue, "new");
    assert.equal(diff[0].changed, true);
  });

  it("marks guidelinesContent with warnIfFromStudent for soul_generation", () => {
    const diff = buildFieldDiff("soul_generation", {}, { guidelinesContent: "## Areas" });
    const gc = diff.find((d) => d.key === "guidelinesContent");
    assert.equal(gc.warnIfFromStudent, true);
  });

  it("does not include warnIfFromStudent for non-soul features", () => {
    const diff = buildFieldDiff("monthly_plan", {}, { systemPrompt: "x" });
    assert.equal(diff[0].warnIfFromStudent, undefined);
  });
});

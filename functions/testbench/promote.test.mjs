/**
 * Tests for promoteTestBenchConfig CF helper (PEP-326).
 *
 * Tests the core promote logic in isolation (no Firebase SDK dependency).
 * Covers: validation, field mapping, version snapshot, merge writes.
 *
 * Run: node --test functions/testbench/promote.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROMOTE_MAP,
  VALID_FEATURE_IDS,
  MAX_HISTORY_ENTRIES,
} from "./promoteFieldMap.js";
import {
  validatePromoteRequest,
  resolveTargets,
  buildPromotionWrite,
  buildHistoryEntry,
} from "./promote.js";

// -----------------------------------------------
// promoteFieldMap.js — registry tests
// -----------------------------------------------

describe("PROMOTE_MAP", () => {
  it("has entries for all 5 testbench features", () => {
    assert.deepEqual(VALID_FEATURE_IDS.sort(), [
      "digest_generation",
      "handwriting_analysis",
      "interview_question_gen",
      "monthly_plan",
      "soul_generation",
    ]);
  });

  it("every entry has requiresProgramId, requiresPromptType, and targets function", () => {
    for (const id of VALID_FEATURE_IDS) {
      const entry = PROMOTE_MAP[id];
      assert.equal(typeof entry.requiresProgramId, "boolean", `${id} missing requiresProgramId`);
      assert.equal(typeof entry.requiresPromptType, "boolean", `${id} missing requiresPromptType`);
      assert.equal(typeof entry.targets, "function", `${id} missing targets function`);
    }
  });

  it("handwriting_analysis requires programId", () => {
    assert.equal(PROMOTE_MAP.handwriting_analysis.requiresProgramId, true);
  });

  it("soul_generation requires programId", () => {
    assert.equal(PROMOTE_MAP.soul_generation.requiresProgramId, true);
  });

  it("digest_generation requires promptType", () => {
    assert.equal(PROMOTE_MAP.digest_generation.requiresPromptType, true);
  });

  it("interview_question_gen requires neither", () => {
    assert.equal(PROMOTE_MAP.interview_question_gen.requiresProgramId, false);
    assert.equal(PROMOTE_MAP.interview_question_gen.requiresPromptType, false);
  });

  it("monthly_plan requires neither", () => {
    assert.equal(PROMOTE_MAP.monthly_plan.requiresProgramId, false);
    assert.equal(PROMOTE_MAP.monthly_plan.requiresPromptType, false);
  });

  it("MAX_HISTORY_ENTRIES is 10", () => {
    assert.equal(MAX_HISTORY_ENTRIES, 10);
  });
});

// -----------------------------------------------
// Field mapping — targets resolution
// -----------------------------------------------

describe("resolveTargets", () => {
  it("handwriting_analysis maps to writing_analysis_{programId}", () => {
    const targets = resolveTargets("handwriting_analysis", "primary", null);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].docPath, "config/writing_analysis_primary");
    assert.equal(targets[0].fields.systemPrompt, "systemPrompt");
  });

  it("soul_generation maps to 2 docs", () => {
    const targets = resolveTargets("soul_generation", "toddler", null);
    assert.equal(targets.length, 2);
    assert.equal(targets[0].docPath, "config/soul_generation");
    assert.equal(targets[1].docPath, "config/soul_guidelines_toddler");
    assert.equal(targets[1].fields.guidelinesContent, "markdown");
  });

  it("digest_generation classroom maps systemPrompt to classroomPrompt", () => {
    const targets = resolveTargets("digest_generation", null, "classroom");
    assert.equal(targets.length, 1);
    assert.equal(targets[0].docPath, "config/weekly_digest");
    assert.equal(targets[0].fields.systemPrompt, "classroomPrompt");
  });

  it("digest_generation superadmin maps systemPrompt to superadminPrompt", () => {
    const targets = resolveTargets("digest_generation", null, "superadmin");
    assert.equal(targets[0].fields.systemPrompt, "superadminPrompt");
  });

  it("interview_question_gen maps to config/interview_question_gen", () => {
    const targets = resolveTargets("interview_question_gen", null, null);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].docPath, "config/interview_question_gen");
  });

  it("monthly_plan maps to config/monthly_plan", () => {
    const targets = resolveTargets("monthly_plan", null, null);
    assert.equal(targets[0].docPath, "config/monthly_plan");
  });
});

// -----------------------------------------------
// Validation
// -----------------------------------------------

describe("validatePromoteRequest", () => {
  const validBase = {
    featureId: "monthly_plan",
    fields: { systemPrompt: "new prompt", model: "gpt-5.4" },
  };

  it("passes for a valid simple request", () => {
    const result = validatePromoteRequest(validBase);
    assert.equal(result.valid, true);
  });

  it("rejects unknown featureId", () => {
    const result = validatePromoteRequest({ ...validBase, featureId: "bogus" });
    assert.equal(result.valid, false);
    assert.match(result.error, /featureId/);
  });

  it("rejects missing featureId", () => {
    const result = validatePromoteRequest({ fields: { systemPrompt: "x" } });
    assert.equal(result.valid, false);
  });

  it("rejects empty fields object", () => {
    const result = validatePromoteRequest({ featureId: "monthly_plan", fields: {} });
    assert.equal(result.valid, false);
    assert.match(result.error, /fields/i);
  });

  it("rejects missing fields", () => {
    const result = validatePromoteRequest({ featureId: "monthly_plan" });
    assert.equal(result.valid, false);
  });

  it("rejects unknown field keys", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { systemPrompt: "ok", bogusField: "nope" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /bogusField/);
  });

  it("rejects handwriting_analysis without programId", () => {
    const result = validatePromoteRequest({
      featureId: "handwriting_analysis",
      fields: { systemPrompt: "x" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /programId/);
  });

  it("passes handwriting_analysis with valid programId", () => {
    const result = validatePromoteRequest({
      featureId: "handwriting_analysis",
      fields: { systemPrompt: "x" },
      programId: "primary",
    });
    assert.equal(result.valid, true);
  });

  it("rejects invalid programId", () => {
    const result = validatePromoteRequest({
      featureId: "handwriting_analysis",
      fields: { systemPrompt: "x" },
      programId: "nursery",
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /programId/);
  });

  it("rejects soul_generation without programId", () => {
    const result = validatePromoteRequest({
      featureId: "soul_generation",
      fields: { systemPrompt: "x" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /programId/);
  });

  it("rejects digest_generation without promptType", () => {
    const result = validatePromoteRequest({
      featureId: "digest_generation",
      fields: { systemPrompt: "x" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /promptType/);
  });

  it("passes digest_generation with valid promptType", () => {
    const result = validatePromoteRequest({
      featureId: "digest_generation",
      fields: { systemPrompt: "x" },
      promptType: "classroom",
    });
    assert.equal(result.valid, true);
  });

  it("rejects invalid promptType", () => {
    const result = validatePromoteRequest({
      featureId: "digest_generation",
      fields: { systemPrompt: "x" },
      promptType: "admin",
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /promptType/);
  });

  it("rejects non-string systemPrompt", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { systemPrompt: 42 },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /systemPrompt.*string/i);
  });

  it("rejects non-number temperature", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { temperature: "warm" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /temperature.*number/i);
  });

  it("rejects non-number max_tokens", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { max_tokens: "lots" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /max_tokens.*number/i);
  });

  it("rejects non-string model", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { model: 123 },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /model.*string/i);
  });

  it("allows guidelinesContent only for soul_generation", () => {
    const result = validatePromoteRequest({
      featureId: "monthly_plan",
      fields: { guidelinesContent: "## Areas" },
    });
    assert.equal(result.valid, false);
    assert.match(result.error, /guidelinesContent/);
  });

  it("passes guidelinesContent for soul_generation", () => {
    const result = validatePromoteRequest({
      featureId: "soul_generation",
      fields: { guidelinesContent: "## Areas\n- Math" },
      programId: "primary",
    });
    assert.equal(result.valid, true);
  });
});

// -----------------------------------------------
// buildPromotionWrite — merge payload construction
// -----------------------------------------------

describe("buildPromotionWrite", () => {
  it("maps variant fields to firestore field names via target", () => {
    const target = {
      docPath: "config/weekly_digest",
      fields: {
        systemPrompt: "classroomPrompt",
        model: "model",
        temperature: "temperature",
        max_tokens: "max_tokens",
      },
    };
    const variantFields = {
      systemPrompt: "You are a digest agent...",
      model: "gpt-5.4",
      temperature: 0.4,
      max_tokens: 4000,
    };
    const write = buildPromotionWrite(target, variantFields);
    assert.equal(write.classroomPrompt, "You are a digest agent...");
    assert.equal(write.model, "gpt-5.4");
    assert.equal(write.temperature, 0.4);
    assert.equal(write.max_tokens, 4000);
    assert.equal(write.systemPrompt, undefined, "should not contain original key when renamed");
  });

  it("only includes fields present in both target and variantFields", () => {
    const target = {
      docPath: "config/monthly_plan",
      fields: {
        systemPrompt: "systemPrompt",
        model: "model",
        temperature: "temperature",
        max_tokens: "max_tokens",
      },
    };
    // Only promoting systemPrompt — others deselected by user
    const variantFields = { systemPrompt: "new prompt" };
    const write = buildPromotionWrite(target, variantFields);
    assert.equal(write.systemPrompt, "new prompt");
    assert.equal(write.model, undefined);
    assert.equal(write.temperature, undefined);
  });

  it("maps guidelinesContent to markdown for soul guidelines", () => {
    const target = {
      docPath: "config/soul_guidelines_primary",
      fields: { guidelinesContent: "markdown" },
    };
    const variantFields = { guidelinesContent: "## Areas\n- Language" };
    const write = buildPromotionWrite(target, variantFields);
    assert.equal(write.markdown, "## Areas\n- Language");
    assert.equal(write.guidelinesContent, undefined);
  });
});

// -----------------------------------------------
// buildHistoryEntry — version snapshot
// -----------------------------------------------

describe("buildHistoryEntry", () => {
  it("creates a snapshot with required metadata", () => {
    const currentDoc = { systemPrompt: "old prompt", model: "gpt-4o", temperature: 0.3, contextualNotes: ["note1"] };
    const fieldsBeingWritten = { systemPrompt: "new prompt", model: "gpt-5.4" };
    const entry = buildHistoryEntry(currentDoc, fieldsBeingWritten, {
      uid: "user123",
      name: "Thilak Mohan",
      runId: "run_abc",
      featureId: "monthly_plan",
    });

    assert.equal(entry.snapshot.systemPrompt, "old prompt");
    assert.equal(entry.snapshot.model, "gpt-4o");
    assert.equal(entry.snapshot.contextualNotes, undefined, "should only snapshot fields being overwritten");
    assert.equal(entry.replacedBy.uid, "user123");
    assert.equal(entry.replacedBy.name, "Thilak Mohan");
    assert.equal(entry.promotedFromRun, "run_abc");
    assert.equal(entry.featureId, "monthly_plan");
    assert.ok(entry.replacedAt, "should have replacedAt timestamp");
  });

  it("handles missing runId gracefully", () => {
    const entry = buildHistoryEntry({ systemPrompt: "old" }, { systemPrompt: "new" }, {
      uid: "u1", name: "Test", featureId: "monthly_plan",
    });
    assert.equal(entry.promotedFromRun, null);
  });

  it("snapshots only the fields being overwritten", () => {
    const currentDoc = { systemPrompt: "old", model: "gpt-4o", temperature: 0.3, max_tokens: 2000, description: "meta" };
    const fieldsBeingWritten = { model: "gpt-5.4" };
    const entry = buildHistoryEntry(currentDoc, fieldsBeingWritten, {
      uid: "u1", name: "T", featureId: "monthly_plan",
    });
    assert.deepEqual(Object.keys(entry.snapshot), ["model"]);
    assert.equal(entry.snapshot.model, "gpt-4o");
  });
});

// -----------------------------------------------
// History cap enforcement
// -----------------------------------------------

describe("history cap", () => {
  it("MAX_HISTORY_ENTRIES is 10", () => {
    assert.equal(MAX_HISTORY_ENTRIES, 10);
  });
});

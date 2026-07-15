/**
 * Tests for brain reader helpers (#157).
 *
 * Pure logic — no Firebase dependency, imported directly.
 * Run with: node --test functions/test/brainHelpers.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveProgramFolder,
  isSchoolWideOnly,
  assembleBrainContext,
} from "../shared/brain.helpers.mjs";

// ---------------------------------------------------------------------------
// resolveProgramFolder
// ---------------------------------------------------------------------------

describe("resolveProgramFolder", () => {
  test("toddler normalizes to primary", () => {
    assert.equal(resolveProgramFolder("toddler"), "primary");
  });

  test("primary, elementary, adolescent pass through", () => {
    assert.equal(resolveProgramFolder("primary"), "primary");
    assert.equal(resolveProgramFolder("elementary"), "elementary");
    assert.equal(resolveProgramFolder("adolescent"), "adolescent");
  });

  test("throws on unknown programId", () => {
    assert.throws(() => resolveProgramFolder("kindergarten"), /Unknown program/);
  });
});

// ---------------------------------------------------------------------------
// isSchoolWideOnly
// ---------------------------------------------------------------------------

describe("isSchoolWideOnly", () => {
  test("true for text-summarizer and voice-transcriber", () => {
    assert.equal(isSchoolWideOnly("text-summarizer"), true);
    assert.equal(isSchoolWideOnly("voice-transcriber"), true);
  });

  test("false for program pipelines", () => {
    assert.equal(isSchoolWideOnly("coach"), false);
    assert.equal(isSchoolWideOnly("weekly-snapshot"), false);
    assert.equal(isSchoolWideOnly("term-report"), false);
  });
});

// ---------------------------------------------------------------------------
// assembleBrainContext
// ---------------------------------------------------------------------------

function doc(overrides) {
  return {
    content: "",
    type: "knowledge",
    pipeline: null,
    audience: null,
    filename: "x.md",
    ...overrides,
  };
}

const schoolWideDocs = [
  doc({ filename: "philosophy.md", content: "SW-PHILOSOPHY" }),
  doc({ filename: "nomenclature.md", content: "SW-NOMENCLATURE" }),
  // school-wide pipeline docs must NOT leak into other pipelines' layer 1
  doc({ filename: "prompt.md", type: "prompt", pipeline: "text-summarizer", content: "TS-PROMPT" }),
  doc({ filename: "config.json", type: "config", pipeline: "text-summarizer", config: { model: "mini" } }),
];

const programDocs = [
  doc({ filename: "context.md", content: "PROG-CONTEXT" }),
  doc({ filename: "nomenclature.md", content: "PROG-NOMENCLATURE" }),
  doc({ filename: "language-conventions.md", audience: "teacher-facing", content: "TEACHER-LANG" }),
  doc({ filename: "language-conventions.md", audience: "parent-facing", content: "PARENT-LANG" }),
  doc({ filename: "prompt.md", type: "prompt", pipeline: "coach", audience: "teacher-facing", content: "COACH-PROMPT" }),
  doc({ filename: "config.json", type: "config", pipeline: "coach", audience: "teacher-facing", content: "{}", config: { model: "frontier", temperature: 0.5 } }),
  doc({ filename: "rubric.md", pipeline: "coach", audience: "teacher-facing", content: "COACH-RUBRIC" }),
  doc({ filename: "prompt.md", type: "prompt", pipeline: "term-report", audience: "parent-facing", content: "TERM-PROMPT" }),
  doc({ filename: "config.json", type: "config", pipeline: "term-report", audience: "parent-facing", config: { model: "frontier" } }),
];

describe("assembleBrainContext", () => {
  test("returns config, prompt, and layered knowledge for a pipeline", () => {
    const ctx = assembleBrainContext(schoolWideDocs, programDocs, {
      pipeline: "coach",
      audience: "teacher-facing",
    });
    assert.deepEqual(ctx.config, { model: "frontier", temperature: 0.5 });
    assert.equal(ctx.prompt, "COACH-PROMPT");
    // Layer order: school-wide -> program -> audience -> pipeline.
    // Alphabetical by filename within each layer.
    assert.deepEqual(ctx.knowledge.split("\n\n"), [
      "SW-NOMENCLATURE", // nomenclature.md < philosophy.md
      "SW-PHILOSOPHY",
      "PROG-CONTEXT", // context.md < nomenclature.md
      "PROG-NOMENCLATURE",
      "TEACHER-LANG",
      "COACH-RUBRIC",
    ]);
  });

  test("parent-facing pipeline gets parent audience knowledge, not teacher", () => {
    const ctx = assembleBrainContext(schoolWideDocs, programDocs, {
      pipeline: "term-report",
      audience: "parent-facing",
    });
    assert.equal(ctx.prompt, "TERM-PROMPT");
    assert.equal(ctx.knowledge.includes("PARENT-LANG"), true);
    assert.equal(ctx.knowledge.includes("TEACHER-LANG"), false);
    assert.equal(ctx.knowledge.includes("COACH-RUBRIC"), false);
  });

  test("other pipelines' prompts and configs never leak into knowledge", () => {
    const ctx = assembleBrainContext(schoolWideDocs, programDocs, {
      pipeline: "coach",
      audience: "teacher-facing",
    });
    assert.equal(ctx.knowledge.includes("TS-PROMPT"), false);
    assert.equal(ctx.knowledge.includes("TERM-PROMPT"), false);
  });

  test("school-wide-only pipeline: same docs passed for both layers", () => {
    const ctx = assembleBrainContext(schoolWideDocs, schoolWideDocs, {
      pipeline: "text-summarizer",
      audience: null,
    });
    assert.equal(ctx.prompt, "TS-PROMPT");
    assert.deepEqual(ctx.config, { model: "mini" });
    // School-wide knowledge appears once, not duplicated across layers.
    const occurrences = ctx.knowledge.split("SW-PHILOSOPHY").length - 1;
    assert.equal(occurrences, 1);
  });

  test("missing config or prompt yields nulls (pipeline with knowledge only)", () => {
    const ctx = assembleBrainContext([], programDocs, {
      pipeline: "nonexistent",
      audience: "teacher-facing",
    });
    assert.equal(ctx.config, null);
    assert.equal(ctx.prompt, null);
  });

  test("empty layers produce empty knowledge string", () => {
    const ctx = assembleBrainContext([], [], { pipeline: "coach", audience: "teacher-facing" });
    assert.equal(ctx.knowledge, "");
  });
});

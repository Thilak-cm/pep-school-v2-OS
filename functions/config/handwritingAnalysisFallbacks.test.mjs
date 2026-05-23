/**
 * Tests for writing analysis fallback prompt resolution (PEP-263).
 *
 * Run with: node --test functions/config/handwritingAnalysisFallbacks.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  HANDWRITING_ANALYSIS_DEFAULTS,
  HANDWRITING_ANALYSIS_FALLBACK_PROMPT,
  WRITING_ANALYSIS_FALLBACK_PROMPTS,
  getFallbackPromptForProgram,
} from "./handwritingAnalysisFallbacks.js";

test("HANDWRITING_ANALYSIS_DEFAULTS has expected fields", () => {
  assert.equal(typeof HANDWRITING_ANALYSIS_DEFAULTS.model, "string");
  assert.equal(HANDWRITING_ANALYSIS_DEFAULTS.temperature, 0.3);
  assert.equal(HANDWRITING_ANALYSIS_DEFAULTS.max_tokens, 2000);
  assert.equal(HANDWRITING_ANALYSIS_DEFAULTS.minSamples, 3);
});

test("WRITING_ANALYSIS_FALLBACK_PROMPTS has all 4 programs", () => {
  assert.ok("toddler" in WRITING_ANALYSIS_FALLBACK_PROMPTS);
  assert.ok("primary" in WRITING_ANALYSIS_FALLBACK_PROMPTS);
  assert.ok("elementary" in WRITING_ANALYSIS_FALLBACK_PROMPTS);
  assert.ok("adolescent" in WRITING_ANALYSIS_FALLBACK_PROMPTS);
});

test("toddler fallback aliases to primary", () => {
  assert.equal(WRITING_ANALYSIS_FALLBACK_PROMPTS.toddler, "primary");
});

test("getFallbackPromptForProgram returns primary prompt for primary", () => {
  const prompt = getFallbackPromptForProgram("primary");
  assert.ok(prompt.includes("early writing"));
});

test("getFallbackPromptForProgram returns primary prompt for toddler", () => {
  const prompt = getFallbackPromptForProgram("toddler");
  assert.ok(prompt.includes("early writing"));
});

test("getFallbackPromptForProgram returns elementary prompt", () => {
  const prompt = getFallbackPromptForProgram("elementary");
  assert.ok(prompt.includes("elementary"));
});

test("getFallbackPromptForProgram returns adolescent prompt", () => {
  const prompt = getFallbackPromptForProgram("adolescent");
  assert.ok(prompt.includes("middle school"));
});

test("getFallbackPromptForProgram returns generic for unknown program", () => {
  const prompt = getFallbackPromptForProgram("unknown_program");
  assert.equal(prompt, HANDWRITING_ANALYSIS_FALLBACK_PROMPT);
});

test("getFallbackPromptForProgram returns generic for null/undefined", () => {
  assert.equal(getFallbackPromptForProgram(null), HANDWRITING_ANALYSIS_FALLBACK_PROMPT);
  assert.equal(getFallbackPromptForProgram(undefined), HANDWRITING_ANALYSIS_FALLBACK_PROMPT);
});

test("each program fallback prompt mentions JSON", () => {
  for (const [key, val] of Object.entries(WRITING_ANALYSIS_FALLBACK_PROMPTS)) {
    if (key === "toddler") continue; // alias
    assert.ok(val.includes("JSON"), `${key} fallback should mention JSON`);
  }
});

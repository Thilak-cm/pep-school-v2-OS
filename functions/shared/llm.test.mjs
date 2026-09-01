/**
 * Tests for shared traced LLM helper (#187).
 * Run: node --test functions/shared/llm.test.mjs
 *
 * Tests the pure functions (isReasoningModel, buildChatBody) directly.
 * The async runLLM function depends on Firestore + fetch + Langfuse,
 * so integration testing happens via contract tests and manual verification.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isReasoningModel, buildChatBody } from "./llm.js";

// ---------------------------------------------------------------------------
// isReasoningModel
// ---------------------------------------------------------------------------

describe("isReasoningModel", () => {
  it("detects GPT-5 family as reasoning", () => {
    assert.equal(isReasoningModel("gpt-5.4"), true);
    assert.equal(isReasoningModel("gpt-5.4-mini"), true);
    assert.equal(isReasoningModel("gpt-5.4-nano"), true);
    assert.equal(isReasoningModel("gpt-5-mini"), true);
    assert.equal(isReasoningModel("gpt-5.5"), true);
  });

  it("strips vendor prefix for OpenRouter slugs", () => {
    assert.equal(isReasoningModel("openai/gpt-5.4"), true);
    assert.equal(isReasoningModel("openai/gpt-5.4-mini"), true);
    assert.equal(isReasoningModel("openai/gpt-5-mini"), true);
  });

  it("excludes gpt-5-chat variants", () => {
    assert.equal(isReasoningModel("gpt-5.3-chat"), false);
    assert.equal(isReasoningModel("openai/gpt-5.2-chat"), false);
  });

  it("detects o-series as reasoning", () => {
    assert.equal(isReasoningModel("o1"), true);
    assert.equal(isReasoningModel("o3-mini"), true);
    assert.equal(isReasoningModel("o1-mini"), true);
  });

  it("returns false for non-reasoning models", () => {
    assert.equal(isReasoningModel("gpt-4.1"), false);
    assert.equal(isReasoningModel("gpt-4o"), false);
    assert.equal(isReasoningModel("openai/gpt-4.1-mini"), false);
    assert.equal(isReasoningModel("anthropic/claude-4.6-sonnet"), false);
  });

  it("returns false for null/undefined/empty", () => {
    assert.equal(isReasoningModel(null), false);
    assert.equal(isReasoningModel(undefined), false);
    assert.equal(isReasoningModel(""), false);
  });
});

// ---------------------------------------------------------------------------
// buildChatBody
// ---------------------------------------------------------------------------

describe("buildChatBody", () => {
  it("includes temperature for non-reasoning models", () => {
    const body = buildChatBody({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.5,
    });
    assert.equal(body.model, "openai/gpt-4.1-mini");
    assert.equal(body.temperature, 0.5);
    assert.deepEqual(body.messages, [{ role: "user", content: "hi" }]);
  });

  it("strips temperature for reasoning models", () => {
    const body = buildChatBody({
      model: "openai/gpt-5.4",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.5,
    });
    assert.equal(body.temperature, undefined);
  });

  it("includes max_completion_tokens when provided", () => {
    const body = buildChatBody({
      model: "openai/gpt-5.4",
      messages: [],
      max_completion_tokens: 1000,
    });
    assert.equal(body.max_completion_tokens, 1000);
  });

  it("omits max_completion_tokens when not provided", () => {
    const body = buildChatBody({
      model: "openai/gpt-5.4",
      messages: [],
    });
    assert.equal(body.max_completion_tokens, undefined);
  });

  it("includes response_format when provided", () => {
    const body = buildChatBody({
      model: "openai/gpt-4.1-mini",
      messages: [],
      response_format: { type: "json_object" },
    });
    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("includes stream flag when true", () => {
    const body = buildChatBody({
      model: "openai/gpt-5.4",
      messages: [],
      stream: true,
    });
    assert.equal(body.stream, true);
  });

  it("omits stream when false/undefined", () => {
    const body = buildChatBody({
      model: "openai/gpt-5.4",
      messages: [],
    });
    assert.equal(body.stream, undefined);
  });
});

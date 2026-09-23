/**
 * Tests for shared traced LLM helper (#187).
 * Run: node --test functions/shared/llm.test.mjs
 *
 * Tests the pure functions (isReasoningModel, buildChatBody) directly.
 * The async runLLM function depends on Firestore + fetch + Langfuse,
 * so integration testing happens via contract tests and manual verification.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isReasoningModel, buildChatBody, runLLM } from "./llm.js";

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

// ---------------------------------------------------------------------------
// runLLM timeoutMs (#288)
//
// Uses a full-slug model ("vendor/model") so resolveModel passes through
// without Firestore, unsets Langfuse env so tracing is skipped, and stubs
// globalThis.fetch. Timeout values are per-entry-point (no default) - see
// shared/http.js for the design rationale.
// ---------------------------------------------------------------------------

describe("runLLM timeoutMs (#288)", () => {
  const realFetch = globalThis.fetch;
  const savedEnv = {};
  const ENV_KEYS = ["OPENROUTER_API_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_PUBLIC_KEY"];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  const okResponse = {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  };

  it("attaches an abort signal when timeoutMs is set and resolves under the deadline", async () => {
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push(options);
      return okResponse;
    };

    const result = await runLLM({
      featureId: "test_feature",
      messages: [{ role: "user", content: "hi" }],
      model: "openai/test-model",
      timeoutMs: 5000,
    });
    assert.equal(result.content, "hello");
    assert.ok(seen[0].signal instanceof AbortSignal, "abort signal attached");
  });

  it("attaches no signal when timeoutMs is absent (current behavior preserved)", async () => {
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push(options);
      return okResponse;
    };

    await runLLM({
      featureId: "test_feature",
      messages: [{ role: "user", content: "hi" }],
      model: "openai/test-model",
    });
    assert.equal(seen[0].signal, undefined);
  });

  it("aborts a hung call at the deadline and throws a transient 'unavailable' timeout error", async () => {
    globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });

    await assert.rejects(
      () => runLLM({
        featureId: "test_feature",
        messages: [{ role: "user", content: "hi" }],
        model: "openai/test-model",
        timeoutMs: 30,
      }),
      (err) => {
        assert.equal(err.code, "unavailable", "must be transient (not in PERMANENT_CODES) so workers rethrow -> redelivery");
        assert.match(err.message, /timed out/i);
        return true;
      },
    );
  });
});

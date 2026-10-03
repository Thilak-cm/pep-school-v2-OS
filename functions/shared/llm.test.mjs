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

// ---------------------------------------------------------------------------
// runLLM tail-based sampling + error levels (#298)
//
// Own-trace path: no Langfuse objects before the call; every exit routes
// through recordTailTrace (injected via deps). Nested path (trace passed in):
// generation created upfront on the parent's trace, recorder NEVER called -
// nested calls inherit the parent's sampling decision.
// ---------------------------------------------------------------------------

describe("runLLM tail sampling (#298)", () => {
  const realFetch = globalThis.fetch;
  const savedEnv = {};
  const ENV_KEYS = ["OPENROUTER_API_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_PUBLIC_KEY"];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  function makeDeps({ rate = 0.1 } = {}) {
    const calls = { record: [], rate: [] };
    return {
      calls,
      deps: {
        recordTailTrace: async (payload) => {
          calls.record.push(payload);
          return true;
        },
        getTraceSampleRate: async (featureId) => {
          calls.rate.push(featureId);
          return rate;
        },
      },
    };
  }

  function okFetch({ content = "hello", finishReason = "stop" } = {}) {
    return async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content }, finish_reason: finishReason }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
  }

  const baseArgs = {
    featureId: "text_cleanup",
    messages: [{ role: "user", content: "hi" }],
    model: "openai/test-model",
  };

  it("clean success: recorder called once with feature rate, no level, backdated times", async () => {
    globalThis.fetch = okFetch();
    const { calls, deps } = makeDeps({ rate: 0.1 });
    const before = Date.now();
    const result = await runLLM({ ...baseArgs, deps });
    assert.equal(result.content, "hello");
    assert.deepEqual(calls.rate, ["text_cleanup"]);
    assert.equal(calls.record.length, 1);
    const rec = calls.record[0];
    assert.equal(rec.sampleRate, 0.1);
    assert.equal(rec.trace.name, "text_cleanup");
    assert.ok(rec.trace.startTime instanceof Date);
    assert.ok(rec.trace.startTime.getTime() >= before - 5);
    assert.equal(rec.generation.model, "openai/test-model");
    assert.deepEqual(rec.generation.input, baseArgs.messages);
    assert.equal(rec.generation.end.level, undefined, "clean success carries no level");
    assert.equal(rec.generation.end.output, "hello");
    assert.ok(rec.generation.end.endTime instanceof Date);
    assert.deepEqual(rec.generation.end.usageDetails, { input: 10, output: 5, total: 15 });
  });

  it("cap-hit success (finish_reason=length): level WARNING, rate forced to 1 (always keep)", async () => {
    globalThis.fetch = okFetch({ finishReason: "length" });
    const { calls, deps } = makeDeps({ rate: 0.1 });
    await runLLM({ ...baseArgs, deps });
    const rec = calls.record[0];
    assert.equal(rec.generation.end.level, "WARNING");
    assert.equal(rec.sampleRate, 1, "non-clean exits skip the rate fetch");
    assert.deepEqual(calls.rate, [], "no rate lookup needed when always keeping");
  });

  it("http error: level ERROR, statusMessage http_500, recorder called, throws internal", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => "server broke",
    });
    const { calls, deps } = makeDeps();
    await assert.rejects(() => runLLM({ ...baseArgs, deps }), /AI error: 500/);
    const rec = calls.record[0];
    assert.equal(rec.generation.end.level, "ERROR");
    assert.equal(rec.generation.end.statusMessage, "http_500");
  });

  it("network error: level ERROR, statusMessage network_error", async () => {
    globalThis.fetch = async () => {
      throw new Error("socket hangup");
    };
    const { calls, deps } = makeDeps();
    await assert.rejects(() => runLLM({ ...baseArgs, deps }), /AI service unavailable/);
    assert.equal(calls.record[0].generation.end.level, "ERROR");
    assert.equal(calls.record[0].generation.end.statusMessage, "network_error");
  });

  it("timeout: level ERROR, statusMessage timeout", async () => {
    globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
      options.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
    const { calls, deps } = makeDeps();
    await assert.rejects(() => runLLM({ ...baseArgs, deps, timeoutMs: 20 }), /timed out/);
    assert.equal(calls.record[0].generation.end.level, "ERROR");
    assert.equal(calls.record[0].generation.end.statusMessage, "timeout");
  });

  it("empty response: level ERROR, statusMessage empty_response", async () => {
    globalThis.fetch = okFetch({ content: "" });
    const { calls, deps } = makeDeps();
    await assert.rejects(() => runLLM({ ...baseArgs, deps }), /no content/);
    assert.equal(calls.record[0].generation.end.level, "ERROR");
    assert.equal(calls.record[0].generation.end.statusMessage, "empty_response");
  });

  it("nested path (trace passed in): recorder NEVER called; generation on parent trace", async () => {
    globalThis.fetch = okFetch();
    const { calls, deps } = makeDeps();
    const ends = [];
    const gens = [];
    const parentTrace = {
      generation(payload) {
        gens.push(payload);
        return { end: (p) => ends.push(p) };
      },
    };
    await runLLM({ ...baseArgs, deps, trace: parentTrace });
    assert.equal(calls.record.length, 0, "nested calls must inherit the parent's decision");
    assert.equal(calls.rate.length, 0);
    assert.equal(gens.length, 1);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].level, undefined);
  });

  it("nested path failure: generation.end carries level ERROR", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => "rate limited",
    });
    const { deps } = makeDeps();
    const ends = [];
    const parentTrace = {
      generation: () => ({ end: (p) => ends.push(p) }),
    };
    await assert.rejects(() => runLLM({ ...baseArgs, deps, trace: parentTrace }));
    assert.equal(ends[0].level, "ERROR");
    assert.equal(ends[0].statusMessage, "http_429");
  });

  it("nested path cap-hit: generation.end carries level WARNING", async () => {
    globalThis.fetch = okFetch({ finishReason: "length" });
    const { deps } = makeDeps();
    const ends = [];
    const parentTrace = {
      generation: () => ({ end: (p) => ends.push(p) }),
    };
    await runLLM({ ...baseArgs, deps, trace: parentTrace });
    assert.equal(ends[0].level, "WARNING");
  });

  it("tracing disabled (no Langfuse keys): recorder never called, call still works", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    globalThis.fetch = okFetch();
    const { calls, deps } = makeDeps();
    const result = await runLLM({ ...baseArgs, deps });
    assert.equal(result.content, "hello");
    assert.equal(calls.record.length, 0);
  });
});

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

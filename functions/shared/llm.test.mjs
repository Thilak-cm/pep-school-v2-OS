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
    assert.deepEqual(rec.generation.end.usage, { input: 10, output: 5, total: 15 });
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

// ---------------------------------------------------------------------------
// runLLM provider-error retry (#310)
//
// finish_reason "error" = OpenRouter's upstream died mid-generation after the
// 200 was sent. Partial/empty content is never acceptable output for any
// runLLM caller, so the harness re-issues the identical body (plain re-roll,
// no backoff) up to MAX 2 retries, then throws "unavailable" (transport-class
// -> Pub/Sub redelivery). The error check precedes the empty-content check.
// ---------------------------------------------------------------------------

describe("runLLM provider-error retry (#310)", () => {
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

  function response({
    content = "hello",
    finishReason = "stop",
    usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  } = {}) {
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content }, finish_reason: finishReason }],
        usage,
      }),
    };
  }

  /** Scripted fetch: serves responses in order, counts calls. */
  function seqFetch(responses) {
    const calls = { count: 0 };
    globalThis.fetch = async () => {
      const n = calls.count;
      if (n >= responses.length) {
        throw new Error(`seqFetch: unexpected call ${n}, only ${responses.length} response(s) scripted`);
      }
      calls.count++;
      return responses[n];
    };
    return calls;
  }

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

  /** Fake Langfuse client for asserting own-trace promotion. */
  function makeFakeLangfuse() {
    const state = { traces: [], flushes: 0 };
    const client = {
      trace(payload) {
        const t = { payload, gens: [] };
        t.generation = (gp) => {
          const g = { create: gp, ends: [] };
          t.gens.push(g);
          return { end: (e) => g.ends.push(e) };
        };
        state.traces.push(t);
        return t;
      },
      flushAsync: async () => {
        state.flushes++;
      },
    };
    return { state, client };
  }

  function makeParentTrace() {
    const gens = [];
    const ends = [];
    return {
      gens,
      ends,
      trace: {
        generation(payload) {
          gens.push(payload);
          return { end: (p) => ends.push(p) };
        },
      },
    };
  }

  const baseArgs = {
    featureId: "text_cleanup",
    messages: [{ role: "user", content: "hi" }],
    model: "openai/test-model",
  };

  it("provider error then success: re-rolls and returns the successful content (tracing disabled)", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const calls = seqFetch([
      response({ content: "partial garbage", finishReason: "error" }),
      response(),
    ]);
    const result = await runLLM({ ...baseArgs });
    assert.equal(result.content, "hello");
    assert.equal(result.finishReason, "stop");
    assert.equal(calls.count, 2, "one re-roll after the provider error");
  });

  it("error with empty content is retried, not thrown as empty_response (error check precedes empty check)", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const calls = seqFetch([
      response({ content: "", finishReason: "error" }),
      response(),
    ]);
    const result = await runLLM({ ...baseArgs });
    assert.equal(result.content, "hello");
    assert.equal(calls.count, 2);
  });

  it("exhaustion: 3 consecutive provider errors -> throws 'unavailable' after exactly 3 calls", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const calls = seqFetch([
      response({ content: "p1", finishReason: "error" }),
      response({ content: "p2", finishReason: "error" }),
      response({ content: "p3", finishReason: "error" }),
    ]);
    await assert.rejects(
      () => runLLM({ ...baseArgs }),
      (err) => {
        assert.equal(err.code, "unavailable", "transport-class so fan-out workers NACK -> redelivery");
        return true;
      },
    );
    assert.equal(calls.count, 3, "initial call + 2 retries, no more");
  });

  it("nested path: failed attempt ends level ERROR with statusMessage provider_error and attempt index; success attempt tagged too", async () => {
    seqFetch([
      response({ content: "partial", finishReason: "error" }),
      response(),
    ]);
    const { calls, deps } = makeDeps();
    const parent = makeParentTrace();
    const result = await runLLM({ ...baseArgs, deps, trace: parent.trace });
    assert.equal(result.content, "hello");
    assert.equal(parent.gens.length, 2, "both attempts nest under the one parent trace");
    // Nested path: attempt-0 create-time metadata has no attempt (committed
    // before the error is known - AC4 byte-identity). The attempt tag is
    // injected via end-metadata (Langfuse merges end into create server-side).
    assert.equal(parent.gens[0].metadata.attempt, undefined, "create-time metadata has no attempt");
    assert.equal(parent.ends[0].metadata.attempt, 0, "attempt injected via end-metadata merge");
    assert.equal(parent.gens[1].metadata.attempt, 1);
    assert.equal(parent.ends[0].level, "ERROR");
    assert.equal(parent.ends[0].statusMessage, "provider_error");
    assert.equal(parent.ends[1].level, undefined, "successful retry is a clean generation");
    assert.equal(calls.record.length, 0, "nested path never calls the tail recorder");
  });

  it("failed attempts report token usage when the response includes it", async () => {
    seqFetch([
      response({ content: "partial", finishReason: "error", usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } }),
      response(),
    ]);
    const { deps } = makeDeps();
    const parent = makeParentTrace();
    await runLLM({ ...baseArgs, deps, trace: parent.trace });
    assert.deepEqual(parent.ends[0].usage, { input: 7, output: 3, total: 10 },
      "retries make cost analysis honest - failed-attempt spend is real spend");
  });

  it("own-trace path: first provider error promotes to a real trace; recorder never called; flush owned by harness", async () => {
    seqFetch([
      response({ content: "partial", finishReason: "error" }),
      response(),
    ]);
    const { calls, deps } = makeDeps();
    const { state, client } = makeFakeLangfuse();
    deps.createLangfuse = () => client;
    const result = await runLLM({ ...baseArgs, deps });
    assert.equal(result.content, "hello");
    assert.equal(calls.record.length, 0, "tail recorder bypassed once a retry starts (ERROR = unconditional keep)");
    assert.equal(calls.rate.length, 0, "no sample-rate coin flip on the promoted trace");
    assert.equal(state.traces.length, 1, "exactly one promoted trace for all attempts");
    const t = state.traces[0];
    assert.equal(t.payload.name, "text_cleanup");
    assert.equal(t.payload.metadata.featureId, "text_cleanup");
    assert.ok(t.payload.startTime instanceof Date);
    assert.equal(t.gens.length, 2, "attempt 0 ERROR generation replayed + attempt 1 success generation");
    assert.equal(t.gens[0].create.metadata.attempt, 0);
    assert.equal(t.gens[0].ends[0].level, "ERROR");
    assert.equal(t.gens[0].ends[0].statusMessage, "provider_error");
    assert.ok(t.gens[0].ends[0].endTime instanceof Date, "replayed generation keeps its real end time");
    assert.equal(t.gens[1].create.metadata.attempt, 1);
    assert.equal(t.gens[1].ends[0].level, undefined);
    assert.ok(state.flushes >= 1, "harness owns the flush for the promoted client");
  });

  it("own-trace exhaustion: all 3 ERROR generations on one promoted trace, flushed, then throws unavailable", async () => {
    seqFetch([
      response({ content: "p1", finishReason: "error" }),
      response({ content: "p2", finishReason: "error" }),
      response({ content: "p3", finishReason: "error" }),
    ]);
    const { calls, deps } = makeDeps();
    const { state, client } = makeFakeLangfuse();
    deps.createLangfuse = () => client;
    await assert.rejects(
      () => runLLM({ ...baseArgs, deps }),
      (err) => err.code === "unavailable",
    );
    assert.equal(calls.record.length, 0);
    assert.equal(state.traces.length, 1);
    assert.equal(state.traces[0].gens.length, 3);
    for (const g of state.traces[0].gens) {
      assert.equal(g.ends[0].level, "ERROR");
      assert.equal(g.ends[0].statusMessage, "provider_error");
    }
    assert.ok(state.flushes >= 1, "promoted trace flushed even on the throw path");
  });

  it("own-trace path: 2 provider errors then success - 1 trace, 3 generations (2 ERROR + 1 success), flushed", async () => {
    seqFetch([
      response({ content: "p1", finishReason: "error" }),
      response({ content: "p2", finishReason: "error" }),
      response({ content: "good output" }),
    ]);
    const { calls, deps } = makeDeps();
    const { state, client } = makeFakeLangfuse();
    deps.createLangfuse = () => client;
    const result = await runLLM({ ...baseArgs, deps });
    assert.equal(result.content, "good output");
    assert.equal(result.finishReason, "stop");
    assert.equal(calls.record.length, 0, "tail recorder bypassed - promoted trace owns all generations");
    assert.equal(state.traces.length, 1, "exactly one promoted trace");
    const t = state.traces[0];
    assert.equal(t.gens.length, 3, "2 ERROR + 1 success generations");
    // Attempt 0: replayed onto promoted trace with injected attempt tag
    assert.equal(t.gens[0].create.metadata.attempt, 0);
    assert.equal(t.gens[0].ends[0].level, "ERROR");
    assert.equal(t.gens[0].ends[0].statusMessage, "provider_error");
    // Attempt 1: nested on promoted trace (inRetryContext = true)
    assert.equal(t.gens[1].create.metadata.attempt, 1);
    assert.equal(t.gens[1].ends[0].level, "ERROR");
    assert.equal(t.gens[1].ends[0].statusMessage, "provider_error");
    // Attempt 2: success
    assert.equal(t.gens[2].create.metadata.attempt, 2);
    assert.equal(t.gens[2].ends[0].level, undefined, "clean success has no level");
    assert.ok(state.flushes >= 1, "harness owns the flush for the promoted client");
  });

  it("nested-path exhaustion: 3 consecutive errors -> throws unavailable, all 3 ERROR generations on parent trace", async () => {
    const fetchCalls = seqFetch([
      response({ content: "p1", finishReason: "error" }),
      response({ content: "p2", finishReason: "error" }),
      response({ content: "p3", finishReason: "error" }),
    ]);
    const { calls, deps } = makeDeps();
    const parent = makeParentTrace();
    await assert.rejects(
      () => runLLM({ ...baseArgs, deps, trace: parent.trace }),
      (err) => err.code === "unavailable",
    );
    assert.equal(parent.gens.length, 3, "all 3 attempts nest under the one parent trace");
    for (let i = 0; i < 3; i++) {
      assert.equal(parent.ends[i].level, "ERROR");
      assert.equal(parent.ends[i].statusMessage, "provider_error");
      assert.equal(parent.ends[i].metadata.attempt, i, `attempt ${i} tagged via end-metadata`);
    }
    assert.equal(fetchCalls.count, 3, "initial + 2 retries");
    assert.equal(calls.record.length, 0, "nested path never calls the tail recorder");
  });

  it("no retry on finish_reason 'stop': exactly one call", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const calls = seqFetch([response()]);
    const result = await runLLM({ ...baseArgs });
    assert.equal(result.content, "hello");
    assert.equal(calls.count, 1);
  });

  it("no retry on HTTP error: exactly one call, still throws internal", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    let count = 0;
    globalThis.fetch = async () => {
      count++;
      return { ok: false, status: 500, headers: { get: () => null }, text: async () => "boom" };
    };
    await assert.rejects(() => runLLM({ ...baseArgs }), /AI error: 500/);
    assert.equal(count, 1, "HTTP errors keep their existing no-retry behavior");
  });

  it("no retry on empty content with finish_reason 'stop': one call, throws internal", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    const calls = seqFetch([response({ content: "", finishReason: "stop" })]);
    await assert.rejects(() => runLLM({ ...baseArgs }), /no content/);
    assert.equal(calls.count, 1);
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

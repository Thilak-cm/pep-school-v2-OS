/**
 * Tests for the agent loop timeout path (#288).
 * Run: node --test functions/shared/agentLoop.test.mjs
 *
 * Mirrors the runLLM timeoutMs tests in llm.test.mjs. Uses a full-slug
 * model ("vendor/model") so resolveModel passes through without Firestore,
 * and unsets Langfuse env so tracing is skipped.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop } from "./agentLoop.js";

// ---------------------------------------------------------------------------
// runAgentLoop timeoutMs (#288)
// ---------------------------------------------------------------------------

describe("runAgentLoop timeoutMs (#288)", () => {
  const realFetch = globalThis.fetch;
  const savedEnv = {};
  const ENV_KEYS = [
    "OPENROUTER_API_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_PUBLIC_KEY",
  ];

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

  // -------------------------------------------------------------------------
  // Error levels (#298): timeout and network catch paths must close the
  // per-iteration generation with level ERROR so failures are filterable in
  // the Langfuse UI (the 4 pre-existing ERROR paths already do).
  // -------------------------------------------------------------------------

  function fakeTrace() {
    const ends = [];
    return {
      ends,
      generation: () => ({ end: (p) => ends.push(p) }),
      span: () => ({ end: () => {} }),
    };
  }

  it("timeout closes the generation with level ERROR (#298)", async () => {
    globalThis.fetch = (url, options = {}) =>
      new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const trace = fakeTrace();
    await assert.rejects(() =>
      runAgentLoop({
        messages: [{ role: "user", content: "hi" }],
        tools: [],
        toolExecutor: () => ({}),
        model: { model: "openai/test-model", temperature: 0, maxTokens: 100 },
        trace,
        timeoutMs: 30,
      }),
    );
    assert.equal(trace.ends.length, 1);
    assert.equal(trace.ends[0].level, "ERROR");
    assert.equal(trace.ends[0].statusMessage, "timeout");
  });

  it("network error closes the generation with level ERROR (#298)", async () => {
    globalThis.fetch = async () => {
      throw new Error("socket hangup");
    };

    const trace = fakeTrace();
    await assert.rejects(() =>
      runAgentLoop({
        messages: [{ role: "user", content: "hi" }],
        tools: [],
        toolExecutor: () => ({}),
        model: { model: "openai/test-model", temperature: 0, maxTokens: 100 },
        trace,
      }),
    );
    assert.equal(trace.ends[0].level, "ERROR");
    assert.equal(trace.ends[0].statusMessage, "network_error");
  });

  it("aborts a hung call at the deadline and throws AbortError", async () => {
    globalThis.fetch = (url, options = {}) =>
      new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    await assert.rejects(
      () =>
        runAgentLoop({
          messages: [{ role: "user", content: "hi" }],
          tools: [],
          toolExecutor: () => ({}),
          model: {
            model: "openai/test-model",
            temperature: 0,
            maxTokens: 100,
          },
          timeoutMs: 30,
        }),
      (err) => {
        assert.equal(err.name, "AbortError");
        assert.match(err.message, /aborted/i);
        return true;
      },
    );
  });
});

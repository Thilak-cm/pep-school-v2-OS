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

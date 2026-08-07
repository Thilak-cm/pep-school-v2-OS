import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import {
  ProviderStreamError,
  streamOpenRouterResponse,
  streamOpenRouterTurn,
} from "./openrouterStream.js";

function responseFromChunks(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined },
        releaseLock: () => {},
      }),
    },
  };
}

test("streamOpenRouterResponse accumulates and emits content deltas", async () => {
  const output = [];
  const response = responseFromChunks([
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n',
  ]);

  const result = await streamOpenRouterResponse({
    fetchImpl: async () => response,
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "hi" }],
    model: "test-model",
    onChunk: (chunk) => output.push(chunk),
  });

  assert.equal(result, "Hello");
  assert.deepEqual(output, ["Hel", "lo"]);
});

test("streamOpenRouterResponse surfaces provider errors", async () => {
  await assert.rejects(
    () => streamOpenRouterResponse({
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => "rate limited" }),
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [],
      model: "test-model",
      onChunk: () => {},
    }),
    /OpenRouter error: 429/,
  );
});

test("streamOpenRouterTurn closes provider header timing when fetch rejects", async () => {
  const ended = [];
  const telemetry = {
    startStage: (name) => (metadata = {}) => ended.push({ name, metadata }),
  };

  await assert.rejects(
    () => streamOpenRouterTurn({
      fetchImpl: async () => { throw new Error("network unavailable"); },
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [],
      model: "test-model",
      telemetry,
    }),
    /network unavailable/,
  );

  assert.deepEqual(ended, [{ name: "openrouter_request_headers", metadata: {} }]);
});

test("streamOpenRouterTurn rejects a truncated stream before any token", async () => {
  const output = [];

  await assert.rejects(
    () => streamOpenRouterTurn({
      fetchImpl: async () => responseFromChunks([]),
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [{ role: "user", content: "hi" }],
      model: "test-model",
      onChunk: (chunk) => output.push(chunk),
    }),
    (error) => error instanceof ProviderStreamError
      && error.code === "chat/provider-stream-error",
  );

  assert.deepEqual(output, []);
});

test("streamOpenRouterTurn rejects a truncated stream after preserving emitted tokens", async () => {
  const output = [];

  await assert.rejects(
    () => streamOpenRouterTurn({
      fetchImpl: async () => responseFromChunks([
        'data: {"choices":[{"delta":{"content":"Partial reply"}}]}\n\n',
      ]),
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [{ role: "user", content: "hi" }],
      model: "test-model",
      onChunk: (chunk) => output.push(chunk),
    }),
    (error) => error instanceof ProviderStreamError
      && error.code === "chat/provider-stream-error",
  );

  assert.deepEqual(output, ["Partial reply"]);
});

test("streamOpenRouterTurn accepts EOF after a terminal finish reason", async () => {
  const result = await streamOpenRouterTurn({
    fetchImpl: async () => responseFromChunks([
      'data: {"choices":[{"delta":{"content":"Complete"},"finish_reason":"stop"}]}\n\n',
    ]),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "hi" }],
    model: "test-model",
  });

  assert.equal(result.content, "Complete");
  assert.equal(result.finishReason, "stop");
});

test("streamOpenRouterTurn records provider headers, first event, reasoning, and text milestones", async () => {
  const stages = [];
  const milestones = [];
  const dimensions = [];
  const telemetry = {
    startStage: (name) => {
      stages.push(name);
      return () => {};
    },
    mark: (name) => milestones.push(name),
    setDimensions: (value) => dimensions.push(value),
  };

  await streamOpenRouterTurn({
    fetchImpl: async () => responseFromChunks([
      'data: {"provider":"test-provider","choices":[{"delta":{"reasoning":"thinking"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":120,"completion_tokens":30,"completion_tokens_details":{"reasoning_tokens":8},"prompt_tokens_details":{"cached_tokens":20}},"choices":[{"delta":{"content":"Answer"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "hi" }],
    model: "test-model",
    telemetry,
  });

  assert.ok(stages.includes("openrouter_request_headers"));
  assert.deepEqual(milestones, ["first_provider_event", "first_reasoning_event", "first_text_token"]);
  assert.equal(dimensions.some((value) => value.inputTokens === 120
    && value.outputTokens === 30
    && value.reasoningTokens === 8
    && value.cacheTokens === 20), true);
});

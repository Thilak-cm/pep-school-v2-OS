import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import { streamOpenRouterResponse } from "./openrouterStream.js";

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

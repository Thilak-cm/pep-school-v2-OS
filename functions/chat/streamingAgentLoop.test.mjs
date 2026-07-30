import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import { runStreamingAgentLoop, streamOpenRouterTurn } from "./openrouterStream.js";

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

test("streamOpenRouterTurn collects streamed tool call deltas", async () => {
  let body;
  const result = await streamOpenRouterTurn({
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return responseFromChunks([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_1","type":"function","function":{"name":"fetch_observations","arguments":"{\\"lim"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"it\\":2}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ]);
    },
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "hi" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
  });

  assert.equal(body.tools.length, 1);
  assert.equal(result.finishReason, "tool_calls");
  assert.deepEqual(result.toolCalls, [{
    id: "tc_1",
    type: "function",
    function: { name: "fetch_observations", arguments: "{\"limit\":2}" },
  }]);
});

test("runStreamingAgentLoop executes same-turn tool calls concurrently and preserves result order", async () => {
  const fetchResponses = [
    responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_a","type":"function","function":{"name":"fetch_observations","arguments":"{}"}},{"index":1,"id":"tc_b","type":"function","function":{"name":"fetch_interviews","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  ];
  const executionOrder = [];
  const finishers = {};
  let resolveBothStarted;
  const bothStarted = new Promise((resolve) => { resolveBothStarted = resolve; });

  const loopPromise = runStreamingAgentLoop({
    fetchImpl: async () => fetchResponses.shift(),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
    toolExecutor: async (name) => {
      executionOrder.push(`start:${name}`);
      if (executionOrder.length === 2) resolveBothStarted();
      await new Promise((resolve) => { finishers[name] = resolve; });
      executionOrder.push(`end:${name}`);
      return { name };
    },
    onChunk: () => {},
  });

  await bothStarted;
  assert.deepEqual(executionOrder, ["start:fetch_observations", "start:fetch_interviews"]);
  finishers.fetch_interviews();
  finishers.fetch_observations();

  const result = await loopPromise;
  assert.equal(result.content, "Done");
  assert.equal(result.messages[1].tool_calls.length, 2);
  assert.equal(result.messages.at(-2).tool_call_id, "tc_a");
  assert.equal(result.messages.at(-1).tool_call_id, "tc_b");
});

import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { TextEncoder } from "node:util";

import {
  executeToolCallBatch,
  runStreamingAgentLoop,
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

function noOpTrace() {
  return {
    generation: () => ({ end: () => {} }),
    span: () => ({ end: () => {} }),
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
  assert.deepEqual(body.stream_options, { include_usage: true });
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
    tools: [
      { type: "function", function: { name: "fetch_observations" } },
      { type: "function", function: { name: "fetch_interviews" } },
    ],
    toolExecutor: async (name) => {
      executionOrder.push(`start:${name}`);
      if (executionOrder.length === 2) resolveBothStarted();
      await new Promise((resolve) => { finishers[name] = resolve; });
      executionOrder.push(`end:${name}`);
      return { name };
    },
    trace: noOpTrace(),
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

test("executeToolCallBatch waits for prerequisites and preserves model output order", async () => {
  const toolCalls = [
    { id: "dependent", function: { name: "fetch_snapshot_history", arguments: "{}" } },
    { id: "prerequisite", function: { name: "fetch_weekly_snapshot", arguments: "{}" } },
    { id: "independent", function: { name: "fetch_observations", arguments: "{}" } },
  ];
  const executionOrder = [];
  const finishers = {};
  const batch = executeToolCallBatch({
    toolCalls,
    toolPrerequisites: { fetch_snapshot_history: ["fetch_weekly_snapshot"] },
    toolExecutor: async (name) => {
      executionOrder.push(`start:${name}`);
      if (name !== "fetch_snapshot_history") {
        await new Promise((resolve) => { finishers[name] = resolve; });
      }
      executionOrder.push(`end:${name}`);
      return { name };
    },
    trace: noOpTrace(),
  });

  assert.deepEqual(executionOrder, [
    "start:fetch_weekly_snapshot",
    "start:fetch_observations",
  ]);
  finishers.fetch_weekly_snapshot();
  finishers.fetch_observations();

  const results = await batch;
  assert.equal(executionOrder.at(-2), "start:fetch_snapshot_history");
  assert.deepEqual(results.map(({ tc }) => tc.id), ["dependent", "prerequisite", "independent"]);
});

test("executeToolCallBatch records multibyte tool result sizes in UTF-8 bytes", async () => {
  const result = { message: "Pep 🌶️" };
  const toolEnds = [];
  const spanEnds = [];

  await executeToolCallBatch({
    toolCalls: [{ id: "multibyte", function: { name: "fetch_observations", arguments: "{}" } }],
    toolExecutor: async () => result,
    trace: { span: () => ({ end: (metadata) => spanEnds.push(metadata) }) },
    telemetry: {
      startStage: (name) => (metadata = {}) => {
        if (name === "tool_execution") toolEnds.push(metadata);
      },
      incrementDimensions: () => {},
    },
  });

  const serialized = JSON.stringify(result);
  const expectedBytes = Buffer.byteLength(serialized, "utf8");
  assert.equal(expectedBytes > serialized.length, true);
  assert.equal(toolEnds[0].resultSizeBytes, expectedBytes);
  assert.equal(spanEnds[0].metadata.resultSizeBytes, expectedBytes);
});

test("runStreamingAgentLoop records Langfuse generations and tool spans", async () => {
  const fetchResponses = [
    responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_a","type":"function","function":{"name":"fetch_observations","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  ];
  const generations = [];
  const spans = [];
  const trace = {
    generation: (input) => {
      const generation = { input, endCalls: [] };
      generations.push(generation);
      return { end: (output) => generation.endCalls.push(output) };
    },
    span: (input) => {
      const span = { input, endCalls: [] };
      spans.push(span);
      return { end: (output) => span.endCalls.push(output) };
    },
  };

  await runStreamingAgentLoop({
    fetchImpl: async () => fetchResponses.shift(),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
    toolExecutor: async () => ({ observations: 2 }),
    trace,
    onChunk: () => {},
  });

  assert.equal(generations.length, 2);
  assert.equal(generations[0].input.name, "chat-stream-iteration-1");
  assert.deepEqual(generations[0].endCalls[0].output, { toolCalls: ["fetch_observations"] });
  assert.equal(generations[1].endCalls[0].output, "Done");
  assert.equal(spans.length, 1);
  assert.equal(spans[0].input.name, "tool-fetch_observations");
  assert.deepEqual(spans[0].endCalls[0].output, { observations: 2 });
});

test("runStreamingAgentLoop records model iterations, tool layers, and tool durations", async () => {
  const fetchResponses = [
    responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_a","type":"function","function":{"name":"fetch_observations","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  ];
  const stages = [];
  const dimensions = [];
  const telemetry = {
    startStage: (name, metadata = {}) => {
      stages.push({ name, metadata });
      return (endMetadata = {}) => dimensions.push(endMetadata);
    },
    mark: () => {},
    setDimensions: (metadata) => dimensions.push(metadata),
    incrementDimensions: (metadata) => dimensions.push(metadata),
  };

  await runStreamingAgentLoop({
    fetchImpl: async () => fetchResponses.shift(),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
    toolExecutor: async () => ({ observations: 2 }),
    trace: noOpTrace(),
    telemetry,
  });

  assert.equal(stages.filter(({ name }) => name === "model_iteration").length, 2);
  assert.equal(stages.some(({ name }) => name === "tool_layer"), true);
  assert.equal(stages.some(({ name, metadata }) => name === "tool_execution" && metadata.toolName === "fetch_observations"), true);
  assert.equal(dimensions.some((value) => value.modelIterationCount === 2), true);
});

test("runStreamingAgentLoop accumulates tool layers across model iterations", async () => {
  const fetchResponses = [
    responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_first","type":"function","function":{"name":"fetch_observations","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_dependent","type":"function","function":{"name":"fetch_snapshot_history","arguments":"{}"}},{"index":1,"id":"tc_prerequisite","type":"function","function":{"name":"fetch_weekly_snapshot","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  ];
  const recorder = new (await import("./chatTelemetry.js")).ChatLatencyRecorder();

  await runStreamingAgentLoop({
    fetchImpl: async () => fetchResponses.shift(),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [
      { type: "function", function: { name: "fetch_observations" } },
      { type: "function", function: { name: "fetch_snapshot_history" } },
      { type: "function", function: { name: "fetch_weekly_snapshot" } },
    ],
    toolPrerequisites: { fetch_snapshot_history: ["fetch_weekly_snapshot"] },
    toolExecutor: async (name) => ({ name }),
    trace: noOpTrace(),
    telemetry: recorder,
  });

  assert.equal(recorder.snapshot().dimensions.toolLayerCount, 3);
});

test("runStreamingAgentLoop preserves per-iteration provider milestones and accumulates usage", async () => {
  const fetchResponses = [
    responseFromChunks([
      'data: {"usage":{"prompt_tokens":10,"completion_tokens":2},"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_a","type":"function","function":{"name":"fetch_observations","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    responseFromChunks([
      'data: {"usage":{"prompt_tokens":20,"completion_tokens":4},"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
  ];
  const generationEnds = [];
  const recorder = new (await import("./chatTelemetry.js")).ChatLatencyRecorder({
    now: (() => { let tick = 0; return () => tick++; })(),
    wallNow: () => 1_700_000_000_000,
  });

  await runStreamingAgentLoop({
    fetchImpl: async () => fetchResponses.shift(),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
    toolExecutor: async () => ({ observations: 1 }),
    trace: {
      generation: () => ({ end: (value) => generationEnds.push(value) }),
      span: () => ({ end: () => {} }),
    },
    telemetry: recorder,
  });

  const summary = recorder.snapshot();
  assert.equal(summary.milestones.first_provider_event.iteration, 1);
  assert.equal(summary.milestones.first_provider_event_2.iteration, 2);
  assert.equal(summary.milestones.first_text_token.iteration, 2);
  assert.equal(summary.dimensions.inputTokens, 30);
  assert.equal(summary.dimensions.outputTokens, 6);
  assert.equal(summary.dimensions.providerResponseBytes > 0, true);
  assert.equal(summary.stages.usage_recording.count, 1);
  assert.equal(summary.stages.usage_recording_2.count, 1);
  assert.deepEqual(generationEnds.map((value) => value.usage), [
    { input: 10, output: 2 },
    { input: 20, output: 4 },
  ]);
  assert.equal(summary.stages.provider_headers_to_first_event.iteration, 1);
  assert.equal(summary.stages.provider_headers_to_first_event_2.iteration, 2);
});

test("provider tool names outside the selected registry become unknown_tool everywhere", async () => {
  const executed = [];
  const emitted = [];
  const dimensions = [];
  const result = await runStreamingAgentLoop({
    fetchImpl: async () => responseFromChunks([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_bad","type":"function","function":{"name":"Private teacher content","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]),
    apiKey: "secret",
    endpoint: "https://example.test",
    messages: [{ role: "user", content: "question" }],
    model: "test-model",
    tools: [{ type: "function", function: { name: "fetch_observations" } }],
    toolExecutor: async (name) => { executed.push(name); return { error: "disabled" }; },
    trace: noOpTrace(),
    maxIterations: 1,
    onToolCalls: (names) => emitted.push(...names),
    telemetry: {
      startStage: () => () => {},
      mark: () => {},
      setDimensions: (value) => dimensions.push(value),
      incrementDimensions: () => {},
    },
  }).catch((error) => error);

  assert.match(result.message, /exceeded max iterations/);
  assert.deepEqual(executed, ["unknown_tool"]);
  assert.deepEqual(emitted, ["unknown_tool"]);
  assert.equal(JSON.stringify(dimensions).includes("Private teacher content"), false);
  assert.equal(dimensions.some((value) => value.toolNames?.includes("unknown_tool")), true);
});

test("runStreamingAgentLoop refuses model execution without Langfuse", async () => {
  let fetched = false;
  await assert.rejects(
    () => runStreamingAgentLoop({
      fetchImpl: async () => {
        fetched = true;
        return responseFromChunks([]);
      },
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [{ role: "user", content: "question" }],
      model: "test-model",
    }),
    /Langfuse trace is required/,
  );
  assert.equal(fetched, false);
});

test("runStreamingAgentLoop closes the generation when the provider fails", async () => {
  const endCalls = [];
  await assert.rejects(
    () => runStreamingAgentLoop({
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => "unavailable" }),
      apiKey: "secret",
      endpoint: "https://example.test",
      messages: [{ role: "user", content: "question" }],
      model: "test-model",
      trace: { generation: () => ({ end: (value) => endCalls.push(value) }) },
    }),
    /OpenRouter error: 503/,
  );
  assert.equal(endCalls.length, 1);
  assert.equal(endCalls[0].level, "ERROR");
});

import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import {
  ChatLatencyRecorder,
  jsonUtf8ByteLength,
  safeTelemetryDimensions,
} from "./chatTelemetry.js";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_TURN_ID = "00000000-0000-4000-8000-000000000002";

test("jsonUtf8ByteLength counts serialized request payloads as UTF-8 bytes", () => {
  const payload = { message: "Hello, Montessori 🌱 नमस्ते" };
  const serialized = JSON.stringify(payload);

  assert.equal(jsonUtf8ByteLength(payload), new TextEncoder().encode(serialized).byteLength);
  assert.ok(jsonUtf8ByteLength(payload) > serialized.length);
});

test("ChatLatencyRecorder records monotonic stages and emits one terminal summary", () => {
  const ticks = [100, 100, 112, 130, 145, 150];
  const logs = [];
  const recorder = new ChatLatencyRecorder({
    runId: RUN_ID,
    now: () => ticks.shift(),
    wallNow: () => 1_700_000_000_000,
  });
  const finishStage = recorder.startStage("auth_token_verify");
  finishStage({ cacheStatus: "miss", ignored: "secret" });
  recorder.mark("first_text_token");
  recorder.setDimensions({ model: "gpt-test", studentId: "student-secret" });
  recorder.setOutcome("completed");

  const first = recorder.emit({ info: (_message, payload) => logs.push(payload) });
  const second = recorder.emit({ info: (_message, payload) => logs.push(payload) });

  assert.equal(first, second);
  assert.equal(logs.length, 1);
  assert.equal(first.eventName, "chat_server_latency");
  assert.equal(first.startedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(first.endedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(first.stages.auth_token_verify.durationMs, 12);
  assert.equal(first.stages.auth_token_verify.startOffsetMs, 0);
  assert.equal(first.stages.auth_token_verify.endOffsetMs, 12);
  assert.equal(first.stages.auth_token_verify.startedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(first.stages.auth_token_verify.endedAt, "2023-11-14T22:13:20.012Z");
  assert.equal(first.milestones.first_text_token.offsetMs, 30);
  assert.equal(first.dimensions.model, "gpt-test");
  assert.equal("studentId" in first.dimensions, false);
  assert.equal(first.outcome, "completed");
});

test("ChatLatencyRecorder backfills completed stages into an attached Langfuse trace", () => {
  const spans = [];
  const recorder = new ChatLatencyRecorder({
    runId: RUN_ID,
    now: (() => { let value = 0; return () => (value += 10); })(),
    wallNow: () => 1_700_000_000_000,
  });
  const end = recorder.startStage("request_validation");
  end();
  recorder.attachTrace({
    span: (input) => {
      const stored = { input, end: null };
      spans.push(stored);
      return { end: (output) => { stored.end = output; } };
    },
  });

  assert.equal(spans.length, 1);
  assert.equal(spans[0].input.name, "latency-request-validation");
  assert.ok(spans[0].input.startTime instanceof Date);
  assert.ok(spans[0].end.endTime instanceof Date);
  assert.deepEqual(spans[0].input.metadata, {});
});

test("Langfuse latency span creation and ending failures never escape telemetry", () => {
  for (const trace of [
    { span: () => { throw new Error("span create failed"); } },
    { span: () => ({ end: () => { throw new Error("span end failed"); } }) },
    { span: () => null },
  ]) {
    const recorder = new ChatLatencyRecorder({
      now: (() => { let value = 0; return () => value++; })(),
      wallNow: () => 1_700_000_000_000,
    });
    const endBeforeTrace = recorder.startStage("request_validation");
    endBeforeTrace();
    assert.doesNotThrow(() => recorder.attachTrace(trace));
    const endAfterTrace = recorder.startStage("student_lookup");
    assert.doesNotThrow(() => endAfterTrace());
    assert.equal(recorder.snapshot().dimensions.latencySpanFailureCount, 2);
  }
});

test("safeTelemetryDimensions keeps aggregate fields and removes content-bearing fields", () => {
  assert.deepEqual(safeTelemetryDimensions({
    model: "gpt-test",
    promptChars: 1200,
    toolNames: ["get_student_observations"],
    message: "private message",
    prompt: "private prompt",
    studentId: "student-1",
    toolArguments: { studentId: "student-1" },
    providerResponseBytes: 120,
    sseResponseBytes: 80,
    responseBytes: 999,
  }), {
    model: "gpt-test",
    promptChars: 1200,
    toolNames: ["get_student_observations"],
    providerResponseBytes: 120,
    sseResponseBytes: 80,
  });
});

test("recorder accepts correlation after request parsing and snapshots without sealing", () => {
  let tick = 0;
  const recorder = new ChatLatencyRecorder({ now: () => tick++ });
  recorder.setCorrelation({ runId: RUN_ID, clientTurnId: CLIENT_TURN_ID });
  const before = recorder.snapshot();
  recorder.mark("terminal_sse");
  const after = recorder.emit({ info: () => {} });

  assert.equal(before.runId, RUN_ID);
  assert.equal(before.clientTurnId, CLIENT_TURN_ID);
  assert.equal("terminal_sse" in before.milestones, false);
  assert.equal(after.milestones.terminal_sse.offsetMs >= 0, true);
});

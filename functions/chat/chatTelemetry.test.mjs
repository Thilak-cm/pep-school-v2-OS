import test from "node:test";
import assert from "node:assert/strict";

import { ChatLatencyRecorder, safeTelemetryDimensions } from "./chatTelemetry.js";

test("ChatLatencyRecorder records monotonic stages and emits one terminal summary", () => {
  const ticks = [100, 100, 112, 130, 145, 150];
  const logs = [];
  const recorder = new ChatLatencyRecorder({
    runId: "run-1",
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
  assert.equal(first.stages.auth_token_verify.durationMs, 12);
  assert.equal(first.milestones.first_text_token.offsetMs, 30);
  assert.equal(first.dimensions.model, "gpt-test");
  assert.equal("studentId" in first.dimensions, false);
  assert.equal(first.outcome, "completed");
});

test("ChatLatencyRecorder backfills completed stages into an attached Langfuse trace", () => {
  const spans = [];
  const recorder = new ChatLatencyRecorder({
    runId: "run-1",
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

test("safeTelemetryDimensions keeps aggregate fields and removes content-bearing fields", () => {
  assert.deepEqual(safeTelemetryDimensions({
    model: "gpt-test",
    promptChars: 1200,
    toolNames: ["get_student_observations"],
    message: "private message",
    prompt: "private prompt",
    studentId: "student-1",
    toolArguments: { studentId: "student-1" },
  }), {
    model: "gpt-test",
    promptChars: 1200,
    toolNames: ["get_student_observations"],
  });
});

test("recorder accepts correlation after request parsing and snapshots without sealing", () => {
  let tick = 0;
  const recorder = new ChatLatencyRecorder({ now: () => tick++ });
  recorder.setCorrelation({ runId: "run-1", clientTurnId: "client-1" });
  const before = recorder.snapshot();
  recorder.mark("terminal_sse");
  const after = recorder.emit({ info: () => {} });

  assert.equal(before.runId, "run-1");
  assert.equal(before.clientTurnId, "client-1");
  assert.equal("terminal_sse" in before.milestones, false);
  assert.equal(after.milestones.terminal_sse.offsetMs >= 0, true);
});

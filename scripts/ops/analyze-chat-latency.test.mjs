import test from "node:test";
import assert from "node:assert/strict";

import { analyzeChatLatency, latencyStats } from "./analyze-chat-latency.mjs";

test("latencyStats reports deterministic nearest-rank distributions", () => {
  assert.deepEqual(latencyStats([40, 10, 30, 20]), {
    count: 4,
    min: 10,
    max: 40,
    p50: 20,
    p95: 40,
  });
  assert.equal(latencyStats([]), null);
});

test("analyzeChatLatency deduplicates retries, joins run IDs, and reports coverage and stages", () => {
  const clientEvents = [
    {
      eventName: "chat_client_latency", eventId: "e1", clientTurnId: "c1",
      attemptRunIds: ["r1"], finalRunId: "r1", outcome: "completed",
      milestones: { firstVisibleToken: 500, terminalEvent: 900 },
    },
    {
      eventName: "chat_client_latency", eventId: "e1", clientTurnId: "c1",
      attemptRunIds: ["r1"], finalRunId: "r1", outcome: "completed",
      milestones: { firstVisibleToken: 500, terminalEvent: 900 },
    },
    {
      eventName: "chat_client_latency", eventId: "e2", clientTurnId: "c2",
      attemptRunIds: ["r2", "r3"], finalRunId: "r3", outcome: "completed",
      milestones: { firstVisibleToken: 1500, terminalEvent: 1900 },
    },
  ];
  const serverEvents = [
    { eventName: "chat_server_latency", runId: "r1", dimensions: { coldInstance: false }, stages: { auth_token_verify: { durationMs: 10 } } },
    { eventName: "chat_server_latency", runId: "r2", dimensions: { coldInstance: false }, stages: {} },
    { eventName: "chat_server_latency", runId: "r3", dimensions: { coldInstance: true }, stages: { auth_token_verify: { durationMs: 30 } } },
    { eventName: "chat_server_latency", runId: "orphan", dimensions: {}, stages: {} },
  ];
  const report = analyzeChatLatency({
    clientEvents,
    serverEvents,
    cases: [
      { clientTurnId: "c1", workloadType: "direct", historyBucket: "small" },
      { clientTurnId: "c2", workloadType: "tool-assisted", historyBucket: "large" },
    ],
  });

  assert.deepEqual(report.coverage, {
    uniqueClientTurns: 2,
    uniqueServerAttempts: 4,
    matchedClientTurns: 2,
    clientTurnsMissingServer: 0,
    serverAttemptsMissingClient: 1,
    duplicateClientDeliveries: 1,
  });
  assert.equal(report.overall.firstVisibleToken.p50, 500);
  assert.equal(report.overall.firstVisibleToken.p95, 1500);
  assert.equal(report.serverStages.auth_token_verify.p50, 10);
  assert.equal(report.byWorkload.direct.firstVisibleToken.p50, 500);
  assert.equal(report.byTemperature.cold.firstVisibleToken.p50, 1500);
});

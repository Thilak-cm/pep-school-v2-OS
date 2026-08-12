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
    serverSummaries: 4,
    postServerSummaries: 4,
    corsPreflightSummaries: 0,
    matchedClientTurns: 2,
    clientTurnsMissingServer: 0,
    clientAttemptsMissingServer: 0,
    serverAttemptsMissingClient: 1,
    uncorrelatedServerAttempts: 0,
    duplicateClientDeliveries: 1,
    duplicateServerSummaries: 0,
  });
  assert.equal(report.overall.firstVisibleToken.p50, 500);
  assert.equal(report.overall.firstVisibleToken.p95, 1500);
  assert.equal(report.serverStages.auth_token_verify.p50, 10);
  assert.equal(report.byWorkload.direct.firstVisibleToken.p50, 500);
  assert.equal(report.byInstanceWarmth.cold.firstVisibleToken.p50, 1500);
});

test("analyzeChatLatency retains uncorrelated attempts and counts missing and duplicate summaries", () => {
  const report = analyzeChatLatency({
    clientEvents: [{
      eventName: "chat_client_latency",
      eventId: "e1",
      clientTurnId: "c1",
      attemptRunIds: ["r1", "missing"],
      finalRunId: "missing",
      outcome: "failed",
      milestones: { terminalEvent: 100 },
    }],
    serverEvents: [
      {
        eventName: "chat_server_latency", runId: "r1",
        stages: { auth_token_verify: { durationMs: 10 } },
      },
      {
        eventName: "chat_server_latency", runId: "r1",
        stages: { auth_token_verify: { durationMs: 12 } },
      },
      {
        eventName: "chat_server_latency", runId: null,
        stages: { request_validation: { durationMs: 2 } },
      },
    ],
  });

  assert.deepEqual(report.coverage, {
    uniqueClientTurns: 1,
    uniqueServerAttempts: 2,
    serverSummaries: 3,
    postServerSummaries: 3,
    corsPreflightSummaries: 0,
    matchedClientTurns: 0,
    clientTurnsMissingServer: 1,
    clientAttemptsMissingServer: 1,
    serverAttemptsMissingClient: 1,
    uncorrelatedServerAttempts: 1,
    duplicateClientDeliveries: 0,
    duplicateServerSummaries: 1,
  });
  assert.equal(report.serverStages.auth_token_verify.count, 1);
  assert.equal(report.serverStages.auth_token_verify.p50, 12);
  assert.equal(report.serverStages.request_validation.p50, 2);
  assert.equal("failed" in report.byOutcome, false);
});

test("analyzeChatLatency separates CORS preflights from POST correlation coverage", () => {
  const report = analyzeChatLatency({
    clientEvents: [{
      eventName: "chat_client_latency", eventId: "e1", clientTurnId: "c1",
      attemptRunIds: ["r1"], finalRunId: "r1", outcome: "completed", milestones: {},
    }],
    serverEvents: [
      {
        eventName: "chat_server_latency", runId: null,
        dimensions: { requestKind: "cors_preflight" },
        stages: { cors_preflight: { durationMs: 4 } },
      },
      {
        eventName: "chat_server_latency", runId: "r1",
        dimensions: { requestKind: "chat_post" }, stages: {},
      },
    ],
  });

  assert.equal(report.coverage.uniqueServerAttempts, 1);
  assert.equal(report.coverage.serverAttemptsMissingClient, 0);
  assert.equal(report.coverage.uncorrelatedServerAttempts, 0);
  assert.equal(report.coverage.postServerSummaries, 1);
  assert.equal(report.coverage.corsPreflightSummaries, 1);
  assert.equal(report.corsPreflight.p50, 4);
  assert.equal("cors_preflight" in report.serverStages, false);
});

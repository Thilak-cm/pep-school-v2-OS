import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_LOOKBACK_MS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizeTimeWindow,
  buildLatencyLoggingFilter,
  sanitizeLatencyEvent,
  correlateLatencyEvents,
  checkLatencyCoverage,
  createCloudLoggingAdapter,
} from "./cloudLogging.js";

const NOW = new Date("2026-08-12T03:00:00.000Z");

test("normalizes explicit and relative windows with a seven-day limit", () => {
  assert.deepEqual(normalizeTimeWindow({
    startTime: "2026-08-11T03:00:00.000Z",
    endTime: "2026-08-12T03:00:00.000Z",
  }, NOW), {
    startTime: "2026-08-11T03:00:00.000Z",
    endTime: "2026-08-12T03:00:00.000Z",
  });
  assert.deepEqual(normalizeTimeWindow({ lookbackMinutes: 30 }, NOW), {
    startTime: "2026-08-12T02:30:00.000Z",
    endTime: "2026-08-12T03:00:00.000Z",
  });
  assert.throws(() => normalizeTimeWindow({ lookbackMinutes: 0 }, NOW), /lookbackMinutes/);
  assert.throws(() => normalizeTimeWindow({ lookbackMinutes: 10081 }, NOW), /7 days/);
  assert.throws(() => normalizeTimeWindow({
    startTime: "2026-08-12T03:00:00.000Z",
    endTime: "2026-08-11T03:00:00.000Z",
  }, NOW), /before/);
});

test("builds a fixed Cloud Logging boundary and only named filters", () => {
  const filter = buildLatencyLoggingFilter({
    startTime: "2026-08-11T03:00:00.000Z",
    endTime: "2026-08-12T03:00:00.000Z",
    eventTypes: ["client", "server"],
    outcomes: ["completed"],
    model: "gpt-5-mini",
  });
  assert.match(filter, /resource\.type = "cloud_function"/);
  assert.match(filter, /resource\.labels\.function_name = "chatClientTelemetry"/);
  assert.match(filter, /resource\.labels\.function_name = "childChatStream"/);
  assert.match(filter, /timestamp >= "2026-08-11T03:00:00.000Z"/);
  assert.match(filter, /jsonPayload\.eventName = "chat_client_latency"/);
  assert.match(filter, /jsonPayload\.eventName = "chat_server_latency"/);
  assert.match(filter, /jsonPayload.outcome = "completed"/);
  assert.match(filter, /jsonPayload.dimensions.model = "gpt-5-mini"/);
  assert.throws(() => buildLatencyLoggingFilter({ query: "severity >= ERROR" }), /unsupported/i);
});

test("sanitizes events to the privacy-safe telemetry allowlist", () => {
  const event = sanitizeLatencyEvent({
    insertId: "event-1",
    timestamp: "2026-08-12T02:59:00.000Z",
    jsonPayload: {
      eventName: "chat_server_latency",
      schemaVersion: 1,
      runId: "run-1",
      clientTurnId: "turn-1",
      outcome: "completed",
      stages: { provider: { durationMs: 10 }, prompt: { durationMs: 4 } },
      dimensions: { model: "gpt-5-mini", functionRegion: "asia-south1", coldInstance: true },
      message: "must not escape",
      prompt: "must not escape",
      toolArgs: { secret: "must not escape" },
      studentName: "must not escape",
    },
  });
  assert.deepEqual(event, {
    eventId: "event-1",
    timestamp: "2026-08-12T02:59:00.000Z",
    eventName: "chat_server_latency",
    schemaVersion: 1,
    runId: "run-1",
    clientTurnId: "turn-1",
    outcome: "completed",
    stages: { provider: { durationMs: 10 }, prompt: { durationMs: 4 } },
    dimensions: { model: "gpt-5-mini", functionRegion: "asia-south1", coldInstance: true },
  });
});

test("sanitizes the Node Cloud Logging client's metadata/data entry shape", () => {
  const event = sanitizeLatencyEvent({
    metadata: {
      insertId: "sdk-event-1",
      timestamp: "2026-08-12T17:08:15.289698Z",
      resource: { labels: { function_name: "childChatStream" } },
    },
    data: {
      jsonPayload: {
        eventName: "chat_server_latency",
        runId: "e9575968-0899-4192-9cfb-18da1b44ba24",
        outcome: "completed",
      },
    },
  });
  assert.deepEqual(event, {
    eventId: "sdk-event-1",
    timestamp: "2026-08-12T17:08:15.289Z",
    eventName: "chat_server_latency",
    runId: "e9575968-0899-4192-9cfb-18da1b44ba24",
    outcome: "completed",
  });
});

test("accepts the SDK entry shape with direct data payload", async () => {
  const adapter = createCloudLoggingAdapter({
    entries: async () => [[{
      metadata: {
        insertId: "sdk-direct-1",
        timestamp: new Date("2026-08-12T17:08:15.289Z"),
      },
      data: {
        eventName: "chat_server_latency",
        runId: "run-direct-1",
      },
    }], null],
  });
  const result = await adapter.exportChatLatencyEvents({ lookbackMinutes: 5 }, NOW);
  assert.equal(result.rawEntryCount, 1);
  assert.equal(result.counts.server, 1);
});

test("correlates by clientTurnId and runId while retaining retries and unmatched events", () => {
  const client = { eventId: "c1", eventName: "chat_client_latency", clientTurnId: "turn-1", finalRunId: "run-2", attemptRunIds: ["run-1", "run-2"] };
  const servers = [
    { eventId: "s1", eventName: "chat_server_latency", runId: "run-1", clientTurnId: "turn-1", dimensions: { retry: 1 } },
    { eventId: "s2", eventName: "chat_server_latency", runId: "run-2", clientTurnId: "turn-1" },
    { eventId: "s3", eventName: "chat_server_latency", runId: "orphan" },
  ];
  const result = correlateLatencyEvents({ clientEvents: [client], serverEvents: servers });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].server.runId, "run-2");
  assert.deepEqual(result.retries.map(({ server }) => server.runId), ["run-1"]);
  assert.deepEqual(result.unmatchedServers.map((event) => event.runId), ["orphan"]);
  assert.deepEqual(correlateLatencyEvents({ clientEvents: [], serverEvents: [] }).matches, []);
});

test("coverage reports duplicates, missing run IDs, orphans, and CORS preflights", () => {
  const result = checkLatencyCoverage({
    clientEvents: [
      { eventId: "c1", clientTurnId: "turn-1", finalRunId: "run-1" },
      { eventId: "c1", clientTurnId: "turn-1", finalRunId: "run-1" },
    ],
    serverEvents: [
      { eventId: "s1", runId: "run-1", clientTurnId: "turn-1", outcome: "completed" },
      { eventId: "s2", runId: "orphan", outcome: "completed" },
      { eventId: "s3", clientTurnId: "turn-2", outcome: "completed" },
      { eventId: "s4", dimensions: { requestKind: "cors_preflight" }, stages: { cors_preflight: { durationMs: 3 } } },
    ],
  });
  assert.equal(result.duplicateClientEvents, 1);
  assert.equal(result.missingRunId, 1);
  assert.equal(result.orphanServers, 1);
  assert.equal(result.corsPreflightEvents, 1);
  assert.deepEqual(result.missingClientTurns, []);
});

test("adapter paginates deterministically and exposes the four tool operations", async () => {
  const calls = [];
  const adapter = createCloudLoggingAdapter({
    entries: async (query, options) => {
      calls.push({ query, options });
      if (options.pageToken) {
        return [[
          { insertId: "oldest", timestamp: "2026-08-12T02:57:00.000Z", resource: { labels: { function_name: "childChatStream" } }, jsonPayload: { eventName: "chat_server_latency", runId: "r2" } },
        ], null];
      }
      return [[
        { insertId: "new", timestamp: "2026-08-12T02:59:00.000Z", logName: "projects/pep-os/logs/cloudfunctions.googleapis.com%2Fcloud-functions", resource: { labels: { function_name: "chatClientTelemetry" } }, jsonPayload: { eventName: "chat_client_latency", clientTurnId: "t2" } },
        { insertId: "old", timestamp: "2026-08-12T02:58:00.000Z", logName: "projects/pep-os/logs/cloudfunctions.googleapis.com%2Fcloud-functions", resource: { labels: { functionName: "childChatStream" } }, jsonPayload: { eventName: "chat_server_latency", runId: "r1" } },
      ], { pageToken: "sdk-next-page" }];
    },
  });
  const result = await adapter.exportChatLatencyEvents({ lookbackMinutes: 10, pageSize: 2 }, NOW);
  assert.deepEqual(Object.keys(result.events), ["client", "server", "preflight"]);
  assert.equal(result.counts.client, 1);
  assert.equal(result.counts.server, 1);
  assert.equal(result.nextPageToken, "sdk-next-page");
  assert.equal(result.truncated, true);
  const next = await adapter.exportChatLatencyEvents({ lookbackMinutes: 10, pageSize: 2, pageToken: result.nextPageToken }, NOW);
  assert.equal(next.counts.server, 1);
  assert.equal(next.nextPageToken, undefined);
  assert.equal(next.truncated, false);
  assert.deepEqual(calls.map(({ options }) => options), [
    { pageSize: 2, pageToken: undefined },
    { pageSize: 2, pageToken: "sdk-next-page" },
  ]);
  assert.match(calls[0].query, /resource\.type = "cloud_function"/);
  assert.match(calls[1].query, /resource\.type = "cloud_function"/);
  assert.match(calls[0].query, /timestamp >= "2026-08-12T02:50:00.000Z"/);
  assert.match(calls[1].query, /timestamp >= "2026-08-12T02:50:00.000Z"/);
  assert.equal(calls.length, 2);
  assert.equal(DEFAULT_PAGE_SIZE, 500);
  assert.equal(MAX_PAGE_SIZE, 2000);
  assert.equal(MAX_LOOKBACK_MS, 7 * 24 * 60 * 60 * 1000);
});

test("turns Cloud Logging authentication failures into an actionable HITL prompt", async () => {
  const adapter = createCloudLoggingAdapter({
    entries: async () => { throw new Error("Could not load the default credentials"); },
  });
  await assert.rejects(
    adapter.exportChatLatencyEvents({ lookbackMinutes: 5 }, NOW),
    /gcloud auth login.*application-default login/,
  );
});

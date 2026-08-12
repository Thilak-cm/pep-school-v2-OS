import test from "node:test";
import assert from "node:assert/strict";

import { handleChatClientTelemetry } from "./clientTelemetry.js";

const EVENT_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_TURN_ID = "00000000-0000-4000-8000-000000000002";
const RUN_ID_1 = "00000000-0000-4000-8000-000000000003";
const RUN_ID_2 = "00000000-0000-4000-8000-000000000004";

function responseRecorder() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function validPayload() {
  return {
    schemaVersion: 1,
    eventId: EVENT_ID,
    clientTurnId: CLIENT_TURN_ID,
    attemptRunIds: [RUN_ID_1, RUN_ID_2],
    attempts: [
      {
        runId: RUN_ID_1, authRetry: false, started: 0, tokenReady: 12,
        requestStarted: 14, responseHeaders: 40, terminalEvent: 48,
        outcome: "failed", errorCategory: "auth/unauthenticated",
      },
      {
        runId: RUN_ID_2, authRetry: true, started: 50, terminalEvent: 900,
        outcome: "completed", errorCategory: null,
      },
    ],
    finalRunId: RUN_ID_2,
    milestones: { send: 0, tokenReady: 12, firstVisibleToken: 400, terminalEvent: 900 },
    dimensions: {
      appVersion: "12.3.0", programId: "primary", requestAttemptCount: 2,
      authRetryCount: 1, sseEventCount: 8, responseBytes: 900,
      visibilityAtSend: "visible", onlineAtSend: true,
      firstVisibleReached: true,
    },
    outcome: "completed",
    errorCategory: null,
  };
}

test("client telemetry endpoint authenticates and writes an allowlisted structured event", async () => {
  const logged = [];
  const res = responseRecorder();
  await handleChatClientTelemetry({
    req: { method: "POST", headers: { authorization: "Bearer valid", origin: "https://app.test" }, body: validPayload() },
    res,
    verifyIdToken: async () => ({ uid: "teacher-1" }),
    logger: { info: (_message, payload) => logged.push(payload) },
    allowedOrigin: "https://app.test",
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.accepted, true);
  assert.equal(res.body.eventId, EVENT_ID);
  assert.equal(typeof res.body.acknowledgedAt, "string");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].eventName, "chat_client_latency");
  assert.equal(logged[0].clientTurnId, CLIENT_TURN_ID);
  assert.deepEqual(logged[0].delivery, {
    attemptedOffsetMs: null,
    acknowledgedAt: res.body.acknowledgedAt,
  });
  assert.equal("uid" in logged[0], false);
});

test("client telemetry endpoint exposes attempted and acknowledged delivery without a second submission", async () => {
  const logged = [];
  const res = responseRecorder();
  const payload = validPayload();
  payload.milestones.telemetryAttempted = 950;

  await handleChatClientTelemetry({
    req: { method: "POST", headers: { authorization: "Bearer valid" }, body: payload },
    res,
    verifyIdToken: async () => ({ uid: "teacher-1" }),
    logger: { info: (_message, value) => logged.push(value) },
  });

  assert.equal(logged.length, 1);
  assert.equal(logged[0].delivery.attemptedOffsetMs, 950);
  assert.equal(logged[0].delivery.acknowledgedAt, res.body.acknowledgedAt);
});

test("client telemetry endpoint rejects unauthenticated requests", async () => {
  const res = responseRecorder();
  await handleChatClientTelemetry({
    req: { method: "POST", headers: {}, body: validPayload() }, res,
    verifyIdToken: async () => assert.fail("must not verify without a token"),
    logger: { info: () => {} },
  });
  assert.equal(res.statusCode, 401);
});

test("client telemetry endpoint rejects unknown and content-bearing fields", async () => {
  for (const extra of [
    { message: "private" },
    { studentId: "student-1" },
    { dimensions: { ...validPayload().dimensions, prompt: "private" } },
  ]) {
    const res = responseRecorder();
    await handleChatClientTelemetry({
      req: { method: "POST", headers: { authorization: "Bearer valid" }, body: { ...validPayload(), ...extra } },
      res,
      verifyIdToken: async () => ({ uid: "teacher-1" }),
      logger: { info: () => assert.fail("invalid payload must not be logged") },
    });
    assert.equal(res.statusCode, 400);
  }
});

test("client telemetry endpoint handles preflight without authentication", async () => {
  const res = responseRecorder();
  await handleChatClientTelemetry({
    req: { method: "OPTIONS", headers: { origin: "https://app.test" } }, res,
    verifyIdToken: async () => assert.fail("preflight must not verify auth"),
    logger: { info: () => {} }, allowedOrigin: "https://app.test",
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://app.test");
});

test("client telemetry endpoint rejects non-opaque IDs and invalid enumerated dimensions", async () => {
  for (const mutate of [
    (payload) => ({ ...payload, eventId: "teacher message" }),
    (payload) => ({ ...payload, clientTurnId: "student/private" }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, appVersion: "version twelve" } }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, programId: "private-program-name" } }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, visibilityAtSend: "focused" } }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, networkEffectiveType: "wifi" } }),
  ]) {
    const res = responseRecorder();
    await handleChatClientTelemetry({
      req: {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: mutate(validPayload()),
      },
      res,
      verifyIdToken: async () => ({ uid: "teacher-1" }),
      logger: { info: () => assert.fail("invalid payload must not be logged") },
    });
    assert.equal(res.statusCode, 400);
  }
});

test("client telemetry endpoint enforces attempt and logical-terminal consistency", async () => {
  for (const mutate of [
    (payload) => ({ ...payload, finalRunId: RUN_ID_1 }),
    (payload) => ({ ...payload, attempts: payload.attempts.slice(0, 1) }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, requestAttemptCount: 1 } }),
    (payload) => ({ ...payload, dimensions: { ...payload.dimensions, authRetryCount: 0 } }),
    (payload) => ({ ...payload, errorCategory: "chat/failed" }),
    (payload) => ({
      ...payload,
      dimensions: { ...payload.dimensions, firstVisibleReached: false },
    }),
  ]) {
    const res = responseRecorder();
    await handleChatClientTelemetry({
      req: { method: "POST", headers: { authorization: "Bearer valid" }, body: mutate(validPayload()) },
      res,
      verifyIdToken: async () => ({ uid: "teacher-1" }),
      logger: { info: () => assert.fail("inconsistent payload must not be logged") },
    });
    assert.equal(res.statusCode, 400);
  }
});

test("client telemetry endpoint applies its size limit to UTF-8 bytes", async () => {
  const res = responseRecorder();
  await handleChatClientTelemetry({
    req: {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: { ...validPayload(), private: "é".repeat(17_000) },
    },
    res,
    verifyIdToken: async () => ({ uid: "teacher-1" }),
    logger: { info: () => assert.fail("oversized payload must not be logged") },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /too large/);
});

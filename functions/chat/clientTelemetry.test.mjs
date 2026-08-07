import test from "node:test";
import assert from "node:assert/strict";

import { handleChatClientTelemetry } from "./clientTelemetry.js";

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
    eventId: "event-1",
    clientTurnId: "client-turn-1",
    attemptRunIds: ["run-1", "run-2"],
    attempts: [
      { runId: "run-1", authRetry: false, started: 0, tokenReady: 12, requestStarted: 14, responseHeaders: 40 },
      { runId: "run-2", authRetry: true, started: 50 },
    ],
    finalRunId: "run-2",
    milestones: { send: 0, tokenReady: 12, firstVisibleToken: 400, terminalEvent: 900 },
    dimensions: {
      appVersion: "12.3.0", programId: "primary", requestAttemptCount: 2,
      authRetryCount: 1, sseEventCount: 8, responseBytes: 900,
      visibilityAtSend: "visible", onlineAtSend: true,
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
  assert.deepEqual(res.body, { accepted: true, eventId: "event-1" });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].eventName, "chat_client_latency");
  assert.equal(logged[0].clientTurnId, "client-turn-1");
  assert.equal("uid" in logged[0], false);
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

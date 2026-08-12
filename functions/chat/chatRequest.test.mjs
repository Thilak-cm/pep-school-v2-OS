import test from "node:test";
import assert from "node:assert/strict";

import { parseChatCorrelation, parseChatRequest } from "./chatRequest.js";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_TURN_ID = "00000000-0000-4000-8000-000000000002";

test("parseChatRequest accepts stable client identifiers", () => {
  assert.deepEqual(
    parseChatRequest({
      studentId: "s1",
      chatId: "c1",
      turnId: "t1",
      runId: RUN_ID,
      userMessageId: "m1",
      clientTurnId: CLIENT_TURN_ID,
      message: " Hello ",
    }),
    {
      studentId: "s1",
      chatId: "c1",
      turnId: "t1",
      runId: RUN_ID,
      userMessageId: "m1",
      clientTurnId: CLIENT_TURN_ID,
      message: "Hello",
    },
  );
});

test("parseChatRequest remains compatible with clients without clientTurnId", () => {
  const parsed = parseChatRequest({
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: RUN_ID,
    userMessageId: "m1",
    message: "Hello",
  });
  assert.equal(parsed.clientTurnId, null);
});

test("parseChatRequest rejects missing identifiers and empty messages", () => {
  assert.throws(() => parseChatRequest({ studentId: "s1", message: "hello" }), /runId is required/);
  assert.throws(() => parseChatRequest({ studentId: "s1", chatId: "c1", turnId: "t1", runId: RUN_ID, userMessageId: "m1", message: " " }), /message is required/);
});

test("parseChatCorrelation validates only opaque correlation IDs before authentication", () => {
  assert.deepEqual(parseChatCorrelation({ runId: RUN_ID, clientTurnId: CLIENT_TURN_ID }), {
    runId: RUN_ID,
    clientTurnId: CLIENT_TURN_ID,
  });
  assert.throws(
    () => parseChatCorrelation({ runId: "private message", clientTurnId: CLIENT_TURN_ID }),
    (error) => error.code === "chat/invalid-request",
  );
  assert.throws(
    () => parseChatCorrelation({ runId: RUN_ID, clientTurnId: "student/private" }),
    (error) => error.code === "chat/invalid-request",
  );
});

test("parseChatCorrelation attaches a valid runId before rejecting clientTurnId", () => {
  const attached = [];

  assert.throws(
    () => parseChatCorrelation(
      { runId: RUN_ID, clientTurnId: "student/private" },
      (correlation) => attached.push(correlation),
    ),
    (error) => error.code === "chat/invalid-request",
  );
  assert.deepEqual(attached, [{ runId: RUN_ID }]);
});

test("parseChatRequest rejects oversized messages", () => {
  assert.throws(
    () => parseChatRequest({ studentId: "s1", chatId: "c1", turnId: "t1", runId: RUN_ID, userMessageId: "m1", message: "x".repeat(20_001) }),
    /message is too long/,
  );
});

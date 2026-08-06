import test from "node:test";
import assert from "node:assert/strict";

import { parseChatRequest } from "./chatRequest.js";

test("parseChatRequest accepts stable client identifiers", () => {
  assert.deepEqual(
    parseChatRequest({
      studentId: "s1",
      chatId: "c1",
      turnId: "t1",
      runId: "r1",
      userMessageId: "m1",
      message: " Hello ",
    }),
    {
      studentId: "s1",
      chatId: "c1",
      turnId: "t1",
      runId: "r1",
      userMessageId: "m1",
      message: "Hello",
    },
  );
});

test("parseChatRequest rejects missing identifiers and empty messages", () => {
  assert.throws(() => parseChatRequest({ studentId: "s1", message: "hello" }), /chatId is required/);
  assert.throws(() => parseChatRequest({ studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", userMessageId: "m1", message: " " }), /message is required/);
});

test("parseChatRequest rejects oversized messages", () => {
  assert.throws(
    () => parseChatRequest({ studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", userMessageId: "m1", message: "x".repeat(20_001) }),
    /message is too long/,
  );
});

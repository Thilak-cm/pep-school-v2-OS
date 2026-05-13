/**
 * PEP-223: Interview session logic tests
 *
 * Tests pure functions for message history building,
 * elapsed time calculation, and conversation serialization.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildMessageHistory, getQuestionCount, serializeConversations, getElapsedMinutes } from "./useInterviewSession.js";

describe("buildMessageHistory", () => {
  it("converts conversation turns to role/content messages", () => {
    const turns = [
      { type: "question", rawContent: '{"question":"What does X do?"}' },
      { type: "answer", answer: "X does Y" },
      { type: "question", rawContent: '{"question":"Can you elaborate?"}' },
    ];
    const messages = buildMessageHistory(turns, "Start interview");
    assert.deepEqual(messages, [
      { role: "user", content: "Start interview" },
      { role: "assistant", content: '{"question":"What does X do?"}' },
      { role: "user", content: "X does Y" },
      { role: "assistant", content: '{"question":"Can you elaborate?"}' },
    ]);
  });

  it("includes kickoff message as first user message", () => {
    const messages = buildMessageHistory([], "Begin now");
    assert.deepEqual(messages, [{ role: "user", content: "Begin now" }]);
  });

  it("skips turns with unrecognized types", () => {
    const turns = [
      { type: "question", rawContent: "Q1" },
      { type: "closing", closingRemarks: "Bye" },
    ];
    const messages = buildMessageHistory(turns, "Start");
    assert.equal(messages.length, 2); // kickoff + Q1 only
  });
});

describe("getQuestionCount", () => {
  it("counts only question-type turns", () => {
    const turns = [
      { type: "question", question: "Q1" },
      { type: "answer", answer: "A1" },
      { type: "question", question: "Q2" },
    ];
    assert.equal(getQuestionCount(turns), 2);
  });

  it("returns 0 for empty conversation", () => {
    assert.equal(getQuestionCount([]), 0);
    assert.equal(getQuestionCount(undefined), 0);
  });
});

describe("serializeConversations", () => {
  it("serializes conversations object to JSON string", () => {
    const convos = { 0: [{ type: "question" }], 1: [{ type: "question" }] };
    const result = serializeConversations(convos);
    assert.equal(typeof result, "string");
    assert.deepEqual(JSON.parse(result), convos);
  });
});

describe("getElapsedMinutes", () => {
  it("returns 0 when startTime is null", () => {
    assert.equal(getElapsedMinutes(null), 0);
  });

  it("calculates minutes from start time to now", () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const result = getElapsedMinutes(fiveMinutesAgo);
    // Allow small tolerance for test execution time
    assert.ok(result >= 4.9 && result <= 5.2, `Expected ~5 minutes, got ${result}`);
  });

  it("rounds to 1 decimal place", () => {
    const twoAndAHalfMinAgo = Date.now() - 2.5 * 60 * 1000;
    const result = getElapsedMinutes(twoAndAHalfMinAgo);
    assert.equal(result, Math.round(result * 10) / 10);
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyEmptyChat,
  deleteEmptyChat,
} from "./cleanup-empty-chats-lib.mjs";

test("cleanup candidate requires zero actual messages and only terminal turns", () => {
  assert.deepEqual(classifyEmptyChat({
    messageCount: 0,
    turns: [{ id: "t1", status: "completed" }, { id: "t2", status: "failed" }],
    subcollectionNames: ["turns"],
  }), { action: "delete", terminalTurnIds: ["t1", "t2"] });

  assert.deepEqual(classifyEmptyChat({
    messageCount: 1,
    turns: [],
    subcollectionNames: ["messages"],
  }), { action: "keep", reason: "contains 1 message(s)" });
});

test("cleanup prominently skips active, missing, and unknown turn states", () => {
  for (const status of ["persisting", "running", undefined, "future-status"]) {
    const result = classifyEmptyChat({
      messageCount: 0,
      turns: [{ id: "t1", ...(status ? { status } : {}) }],
      subcollectionNames: ["turns"],
    });
    assert.equal(result.action, "skip");
    assert.match(result.reason, /turn t1 has (active|missing|unknown) status/);
    assert.equal(result.highlight, true);
  }
});

test("cleanup skips and highlights every unexpected subcollection", () => {
  assert.deepEqual(classifyEmptyChat({
    messageCount: 0,
    turns: [],
    subcollectionNames: ["turns", "audit", "attachments"],
  }), {
    action: "skip",
    reason: "unexpected subcollections: attachments, audit",
    highlight: true,
  });
});

test("cleanup skips a terminal turn that contains nested data", () => {
  assert.deepEqual(classifyEmptyChat({
    messageCount: 0,
    turns: [{ id: "t1", status: "completed", subcollectionNames: ["attempt_logs"] }],
    subcollectionNames: ["turns"],
  }), {
    action: "skip",
    reason: "turn t1 has nested subcollections: attempt_logs",
    highlight: true,
  });
});

test("live cleanup deletes terminal turns before the parent chat", async () => {
  const deleted = [];
  const chatRef = {
    path: "students/s1/chats/c1",
    delete: async () => deleted.push("students/s1/chats/c1"),
  };
  const turns = [
    { id: "t1", ref: { delete: async () => deleted.push("turns/t1") } },
    { id: "t2", ref: { delete: async () => deleted.push("turns/t2") } },
  ];

  await deleteEmptyChat({ chatRef, terminalTurns: turns });
  assert.deepEqual(deleted, ["turns/t1", "turns/t2", "students/s1/chats/c1"]);
});

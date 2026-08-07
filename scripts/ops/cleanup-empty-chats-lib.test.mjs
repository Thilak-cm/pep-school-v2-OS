import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyEmptyChat,
  deleteEmptyChatSafely,
  inspectChat,
} from "./cleanup-empty-chats-lib.mjs";

function createChatHarness({
  path = "students/s1/chats/c1",
  preflightMessages = [],
  preflightTurns = [{ id: "t1", status: "completed" }],
  transactionMessages = preflightMessages,
  transactionTurns = preflightTurns,
  subcollectionNames = ["messages", "turns"],
} = {}) {
  const deletes = [];
  const makeTurn = ({ id, status, nested = [] }) => {
    const ref = {
      path: `${path}/turns/${id}`,
      listCollections: async () => nested.map((name) => ({ id: name })),
    };
    return { id, ref, data: () => ({ status }) };
  };
  const snapshots = (items) => ({
    size: items.length,
    docs: items.map((item) => typeof item === "string"
      ? { id: item, data: () => ({ content: item }) }
      : makeTurn(item)),
  });
  const chatRef = {
    path,
    get: async () => ({ exists: true, ref: chatRef }),
    listCollections: async () => subcollectionNames.map((id) => ({ id })),
    collection(name) {
      return {
        _collectionName: name,
        limit() { return this; },
        get: async () => name === "messages" ? snapshots(preflightMessages) : snapshots(preflightTurns),
      };
    },
  };
  const db = {
    runTransaction: async (callback) => callback({
      get: async (target) => {
        if (target === chatRef) return { exists: true, ref: chatRef };
        return target._collectionName === "messages"
          ? snapshots(transactionMessages)
          : snapshots(transactionTurns);
      },
      delete: (ref) => deletes.push(ref.path),
    }),
  };
  return { chatDoc: { ref: chatRef }, chatRef, db, deletes };
}

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

test("inspectChat uses actual messages and discovers active, unknown, and unexpected data", async (t) => {
  for (const [name, options, reason] of [
    ["active turn", { preflightTurns: [{ id: "active", status: "running" }] }, /active status/],
    ["unknown turn", { preflightTurns: [{ id: "unknown", status: "future" }] }, /unknown status/],
    ["unexpected collection", { preflightTurns: [], subcollectionNames: ["messages", "audit"] }, /unexpected subcollections: audit/],
    ["nested turn collection", { preflightTurns: [{ id: "terminal", status: "failed", nested: ["logs"] }] }, /nested subcollections: logs/],
  ]) {
    await t.test(name, async () => {
      const harness = createChatHarness(options);
      const inspected = await inspectChat(harness.chatDoc);
      assert.equal(inspected.classification.action, "skip");
      assert.match(inspected.classification.reason, reason);
    });
  }
});

test("live cleanup atomically deletes the exact terminal turns and parent", async () => {
  const harness = createChatHarness({
    preflightTurns: [{ id: "t1", status: "completed" }, { id: "t2", status: "failed" }],
  });
  const result = await deleteEmptyChatSafely({
    db: harness.db,
    chatRef: harness.chatRef,
    expectedTerminalTurnIds: ["t1", "t2"],
  });

  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(harness.deletes, [
    "students/s1/chats/c1/turns/t1",
    "students/s1/chats/c1/turns/t2",
    "students/s1/chats/c1",
  ]);
});

test("transaction revalidation blocks messages and active or unknown turns racing deletion", async (t) => {
  for (const [name, options, reason] of [
    ["new message", { transactionMessages: ["new message"] }, /contains 1 message/],
    ["active turn", { transactionTurns: [{ id: "t1", status: "running" }] }, /active status/],
    ["unknown turn", { transactionTurns: [{ id: "t1", status: "future" }] }, /unknown status/],
  ]) {
    await t.test(name, async () => {
      const harness = createChatHarness(options);
      const result = await deleteEmptyChatSafely({
        db: harness.db,
        chatRef: harness.chatRef,
        expectedTerminalTurnIds: ["t1"],
      });
      assert.equal(result.deleted, false);
      assert.match(result.reason, reason);
      assert.deepEqual(harness.deletes, []);
    });
  }
});

test("live cleanup skips candidates whose exact turn IDs changed", async () => {
  const changedBeforeTransaction = createChatHarness({
    preflightTurns: [{ id: "t1", status: "completed" }, { id: "t2", status: "completed" }],
  });
  const preflightResult = await deleteEmptyChatSafely({
    db: changedBeforeTransaction.db,
    chatRef: changedBeforeTransaction.chatRef,
    expectedTerminalTurnIds: ["t1"],
  });
  assert.equal(preflightResult.deleted, false);
  assert.match(preflightResult.reason, /terminal turn IDs changed/);
  assert.deepEqual(changedBeforeTransaction.deletes, []);

  const changedInsideTransaction = createChatHarness({
    transactionTurns: [
      { id: "t1", status: "completed" },
      { id: "t2", status: "completed" },
    ],
  });
  const transactionResult = await deleteEmptyChatSafely({
    db: changedInsideTransaction.db,
    chatRef: changedInsideTransaction.chatRef,
    expectedTerminalTurnIds: ["t1"],
  });
  assert.equal(transactionResult.deleted, false);
  assert.match(transactionResult.reason, /terminal turn IDs changed/);
  assert.deepEqual(changedInsideTransaction.deletes, []);
});

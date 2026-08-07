import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCleanupArgs,
  runCleanup,
} from "./cleanup-empty-chats.mjs";

function chatDoc(path) {
  return { ref: { path } };
}

function fakeScanDb(docs) {
  return {
    collectionGroup: () => ({
      get: async () => ({ docs, size: docs.length }),
    }),
  };
}

test("cleanup CLI is dry-run by default and recognizes only explicit --yes", () => {
  assert.equal(parseCleanupArgs([]).yes, false);
  assert.equal(parseCleanupArgs(["--yes"]).yes, true);
  assert.throws(() => parseCleanupArgs(["--execute"]), /Unknown option/);
});

test("default dry-run reports exact IDs and never invokes deletion", async () => {
  const candidateDoc = chatDoc("students/student-exact/chats/chat-exact");
  const logs = [];
  let deleteCalls = 0;
  const result = await runCleanup({
    db: fakeScanDb([candidateDoc]),
    log: (line) => logs.push(line),
    inspect: async (doc) => ({
      chatDoc: doc,
      turnDocs: [{ id: "turn-a" }, { id: "turn-b" }],
      classification: { action: "delete" },
    }),
    deleteCandidate: async () => { deleteCalls += 1; return { deleted: true }; },
  });

  assert.equal(result.dryRun, true);
  assert.equal(deleteCalls, 0);
  assert.ok(logs.includes(
    "CANDIDATE students/student-exact/chats/chat-exact (terminal turn IDs: turn-a, turn-b)",
  ));
  assert.ok(logs.includes("Candidates: 1"));
});

test("live mode requires yes and passes exact approved IDs to safe deletion", async () => {
  const candidateDoc = chatDoc("students/s1/chats/c1");
  const deleteCalls = [];
  const result = await runCleanup({
    db: fakeScanDb([candidateDoc]),
    yes: true,
    log: () => {},
    inspect: async (doc) => ({
      chatDoc: doc,
      turnDocs: [{ id: "t2" }, { id: "t1" }],
      classification: { action: "delete" },
    }),
    deleteCandidate: async (input) => {
      deleteCalls.push(input);
      return { deleted: true };
    },
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.deleted, 1);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].chatRef.path, "students/s1/chats/c1");
  assert.deepEqual(deleteCalls[0].expectedTerminalTurnIds, ["t2", "t1"]);
});

test("executable scan highlights unexpected paths without inspecting or deleting them", async () => {
  const unexpected = chatDoc("classrooms/class-1/chats/chat-1");
  const logs = [];
  let inspectCalls = 0;
  let deleteCalls = 0;
  const result = await runCleanup({
    db: fakeScanDb([unexpected]),
    yes: true,
    log: (line) => logs.push(line),
    inspect: async () => { inspectCalls += 1; },
    deleteCandidate: async () => { deleteCalls += 1; return { deleted: true }; },
  });

  assert.equal(inspectCalls, 0);
  assert.equal(deleteCalls, 0);
  assert.equal(result.skipped, 1);
  assert.ok(logs.includes(
    "!!! SKIP classrooms/class-1/chats/chat-1: unexpected chat document path",
  ));
});

test("live mode reports a changed candidate and makes no direct delete call", async () => {
  const candidateDoc = chatDoc("students/s1/chats/c1");
  const logs = [];
  const result = await runCleanup({
    db: fakeScanDb([candidateDoc]),
    yes: true,
    log: (line) => logs.push(line),
    inspect: async (doc) => ({
      chatDoc: doc,
      turnDocs: [{ id: "t1" }],
      classification: { action: "delete" },
    }),
    deleteCandidate: async () => ({
      deleted: false,
      reason: "changed since scan: turn t1 has active status: running",
    }),
  });

  assert.equal(result.deleted, 0);
  assert.equal(result.liveSkipped, 1);
  assert.ok(logs.includes(
    "!!! SKIP students/s1/chats/c1: changed since scan: turn t1 has active status: running",
  ));
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureChat,
  ensureUserMessage,
  createTurn,
  updateTurnStatus,
  finalizeAssistantMessage,
  updateChatMetadata,
} from "./chatRepository.js";

function fakeDb() {
  const docs = new Map();
  const key = (ref) => ref.path;
  const makeRef = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection: (name) => ({ doc: (id) => makeRef(`${path}/${name}/${id}`) }),
  });
  const getSnapshot = (ref) => ({
    exists: docs.has(key(ref)),
    id: ref.id,
    data: () => docs.get(key(ref)) || undefined,
  });

  return {
    collection: (...parts) => ({
      doc: (id) => makeRef([...parts, id].join("/")),
    }),
    runTransaction: async (callback) => {
      const tx = {
        get: async (ref) => getSnapshot(ref),
        create: (ref, data) => {
          if (docs.has(key(ref))) throw new Error("already-exists");
          docs.set(key(ref), { ...data });
        },
        set: (ref, data, options = {}) => {
          docs.set(key(ref), options.merge ? { ...(docs.get(key(ref)) || {}), ...data } : { ...data });
        },
        update: (ref, data) => docs.set(key(ref), { ...(docs.get(key(ref)) || {}), ...data }),
      };
      return callback(tx);
    },
    _docs: docs,
  };
}

test("ensureChat creates one metadata document and is idempotent", async () => {
  const db = fakeDb();
  const first = await ensureChat({ db, studentId: "s1", chatId: "c1", createdBy: "u1", classroomId: "class1" });
  const second = await ensureChat({ db, studentId: "s1", chatId: "c1", createdBy: "u1", classroomId: "class1" });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(db._docs.size, 1);
  assert.equal(db._docs.get("students/s1/chats/c1").studentId, "s1");
});

test("ensureChat backfills legacy metadata when touching an existing chat", async () => {
  const db = fakeDb();
  db._docs.set("students/s1/chats/c1", { name: "Legacy Chat", deleted: false });

  const result = await ensureChat({
    db,
    studentId: "s1",
    chatId: "c1",
    createdBy: "u1",
    classroomId: "class1",
  });

  const doc = db._docs.get("students/s1/chats/c1");
  assert.equal(result.created, false);
  assert.equal(doc.createdBy, "u1");
  assert.equal(doc.classroomId, "class1");
  assert.equal(doc.visibility, "classroom");
  assert.equal(doc.studentId, "s1");
});

test("ensureUserMessage does not duplicate a retry with the same ID", async () => {
  const db = fakeDb();
  const input = { db, studentId: "s1", chatId: "c1", messageId: "m1", turnId: "t1", content: "Hello", authorId: "u1" };

  const first = await ensureUserMessage(input);
  const second = await ensureUserMessage(input);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(db._docs.size, 1);
});

test("createTurn stores execution state separately from transcript messages", async () => {
  const db = fakeDb();
  const turn = await createTurn({ db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", userMessageId: "m1", idempotencyKey: "k1" });

  assert.equal(turn.status, "persisting");
  assert.equal(db._docs.get("students/s1/chats/c1/turns/t1").runId, "r1");
  assert.equal(db._docs.has("students/s1/chats/c1/messages/m1"), false);
});

test("finalizeAssistantMessage is idempotent and records interruption state", async () => {
  const db = fakeDb();
  const input = { db, studentId: "s1", chatId: "c1", messageId: "a1", turnId: "t1", runId: "r1", content: "partial answer", status: "interrupted", finishReason: "client_disconnect" };

  const first = await finalizeAssistantMessage(input);
  const second = await finalizeAssistantMessage(input);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(db._docs.get("students/s1/chats/c1/messages/a1").status, "interrupted");
});

test("updateTurnStatus enforces lifecycle transitions and persists metadata", async () => {
  const db = fakeDb();
  await createTurn({ db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", userMessageId: "m1", idempotencyKey: "k1" });

  const updated = await updateTurnStatus({ db, studentId: "s1", chatId: "c1", turnId: "t1", status: "running", metadata: { startedAt: 10 } });

  assert.equal(updated.status, "running");
  assert.equal(updated.startedAt, 10);
  assert.equal(db._docs.get("students/s1/chats/c1/turns/t1").status, "running");
});

test("updateChatMetadata increments messageCount idempotently from caller delta", async () => {
  const db = fakeDb();
  await ensureChat({ db, studentId: "s1", chatId: "c1", createdBy: "u1", classroomId: "class1" });

  await updateChatMetadata({
    db,
    studentId: "s1",
    chatId: "c1",
    metadata: { lastMessagePreview: "hello" },
    messageCountDelta: 2,
  });

  const chat = db._docs.get("students/s1/chats/c1");
  assert.equal(chat.messageCount, 2);
  assert.equal(chat.lastMessagePreview, "hello");
});

import test from "node:test";
import assert from "node:assert/strict";
import * as chatRepository from "./chatRepository.js";

import {
  ensureUserMessage,
  createTurn,
  updateTurnStatus,
  finalizeAssistantMessage,
  updateChatMetadata,
  acquireChatTurn,
  deriveChatTitle,
  finalizeChatTurn,
  startChatTurn,
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
    ref,
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

test("chat repository exposes only the atomic chat creation path", () => {
  assert.equal("ensureChat" in chatRepository, false);
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
  const turn = await createTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    userMessageId: "m1",
    idempotencyKey: "k1",
    model: "test-model",
    langfuseTraceId: "trace-1",
  });

  assert.equal(turn.status, "persisting");
  assert.equal(turn.model, "test-model");
  assert.equal(turn.langfuseTraceId, "trace-1");
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
  await acquireChatTurn(acquireInput(db));

  await updateChatMetadata({
    db,
    studentId: "s1",
    chatId: "c1",
    metadata: { lastMessagePreview: "hello" },
    messageCountDelta: 2,
  });

  const chat = db._docs.get("students/s1/chats/c1");
  assert.equal(chat.messageCount, 3);
  assert.equal(chat.lastMessagePreview, "hello");
});

const acquireInput = (db, overrides = {}) => ({
  db,
  studentId: "s1",
  chatId: "c1",
  turnId: "t1",
  runId: "r1",
  userMessageId: "m1",
  content: "Hello",
  authorId: "u1",
  classroomId: "class1",
  ...overrides,
});

test("new chat title is derived deterministically from the first user message", async () => {
  const db = fakeDb();
  const content = "  Help\nme\u0000 understand this child's long concentration pattern across repeated classroom work cycles today  ";

  await acquireChatTurn(acquireInput(db, { content }));
  const replay = await acquireChatTurn(acquireInput(db, { content }));

  const expected = deriveChatTitle(content);
  assert.equal(expected, "Help me understand this child's long concentration pattern…");
  assert.ok(Array.from(expected).length <= 60);
  assert.equal(db._docs.get("students/s1/chats/c1").name, expected);
  assert.equal(replay.disposition, "active");
});

test("acquireChatTurn returns active replay without rewriting the turn", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  const original = db._docs.get("students/s1/chats/c1/turns/t1");

  const replay = await acquireChatTurn(acquireInput(db));

  assert.equal(replay.disposition, "active");
  assert.equal(db._docs.get("students/s1/chats/c1/turns/t1"), original);
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 1);
});

test("acquireChatTurn rejects mismatched turn and message ID reuse", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));

  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { runId: "different-run" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { turnId: "t2", content: "Different" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { turnId: "t2" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
});

test("a different active turn is rejected without interrupting its owner", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));

  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, {
      turnId: "t2",
      runId: "r2",
      userMessageId: "m2",
      content: "Second message",
    })),
    (error) => error.code === "chat/turn-active",
  );

  assert.equal(db._docs.get("students/s1/chats/c1/turns/t1").status, "persisting");
  assert.equal(db._docs.get("students/s1/chats/c1").activeTurnId, "t1");
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 1);
  assert.equal(db._docs.has("students/s1/chats/c1/messages/m2"), false);
});

test("a terminal interrupted turn reacquires the same logical turn with a fresh run", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await startChatTurn({
    db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", model: "model", langfuseTraceId: "r1",
  });
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    content: "Durable prefix",
    status: "interrupted",
    finishReason: "error",
  });

  const retry = await acquireChatTurn(acquireInput(db, { runId: "r2" }));

  assert.equal(retry.disposition, "acquired");
  assert.equal(retry.userMessageCreated, false);
  assert.equal(retry.turn.runId, "r2");
  assert.equal(retry.turn.assistantMessageId, "r2-assistant");
  assert.equal(retry.turn.status, "persisting");
  assert.deepEqual(retry.turn.attempts.map((attempt) => attempt.runId), ["r1", "r2"]);
  assert.equal(retry.turn.attempts[0].status, "interrupted");
  assert.equal(retry.turn.attempts[1].status, "persisting");
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 2);
  assert.equal(db._docs.get("students/s1/chats/c1/messages/r1-assistant").content, "Durable prefix");
  assert.equal(db._docs.has("students/s1/chats/c1/messages/r2-assistant"), false);
});

test("multiple retries preserve append-only execution and trace history", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await startChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    model: "model-1",
    langfuseTraceId: "trace-1",
  });
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    content: "First prefix",
    status: "interrupted",
    finishReason: "error",
    errorCode: "chat/provider-error",
    model: "model-1",
    langfuseTraceId: "trace-1",
  });

  await acquireChatTurn(acquireInput(db, { runId: "r2" }));
  await startChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r2",
    model: "model-2",
    langfuseTraceId: "trace-2",
  });
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r2",
    status: "failed",
    finishReason: "error",
    errorCode: "chat/timeout",
    model: "model-2",
    langfuseTraceId: "trace-2",
  });

  await acquireChatTurn(acquireInput(db, { runId: "r3" }));
  await startChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r3",
    model: "model-3",
    langfuseTraceId: "trace-3",
  });
  const completed = await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r3",
    content: "Final answer",
    status: "completed",
    finishReason: "stop",
    model: "model-3",
    langfuseTraceId: "trace-3",
  });

  const attempts = completed.turn.attempts;
  assert.deepEqual(attempts.map((attempt) => attempt.runId), ["r1", "r2", "r3"]);
  assert.deepEqual(attempts.map((attempt) => attempt.status), [
    "interrupted",
    "failed",
    "completed",
  ]);
  assert.deepEqual(attempts.map((attempt) => attempt.langfuseTraceId), [
    "trace-1",
    "trace-2",
    "trace-3",
  ]);
  assert.equal(attempts[0].errorCode, "chat/provider-error");
  assert.equal(attempts[1].errorCode, "chat/timeout");
  assert.equal(attempts[2].finishReason, "stop");
  assert.equal(db._docs.get("students/s1/chats/c1/messages/r1-assistant").content, "First prefix");
  assert.equal(db._docs.has("students/s1/chats/c1/messages/r2-assistant"), false);
  assert.equal(db._docs.get("students/s1/chats/c1/messages/r3-assistant").content, "Final answer");
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 3);
});

test("a terminal retry rejects incompatible logical input", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    status: "failed",
    finishReason: "error",
  });

  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { runId: "r2", content: "Changed" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { runId: "r2", userMessageId: "m2" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
});

test("a completed logical turn cannot be reacquired with a new run", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await startChatTurn({
    db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", model: "model", langfuseTraceId: "r1",
  });
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    content: "Answer",
    status: "completed",
  });

  await assert.rejects(
    () => acquireChatTurn(acquireInput(db, { runId: "r2" })),
    (error) => error.code === "chat/idempotency-conflict",
  );
});

test("terminal replay preserves the original result and metadata", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await startChatTurn({
    db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", model: "model", langfuseTraceId: "r1",
  });
  await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    content: "Answer",
    status: "completed",
    finishReason: "stop",
    model: "model",
    langfuseTraceId: "r1",
  });

  const replay = await acquireChatTurn(acquireInput(db));

  assert.equal(replay.disposition, "terminal");
  assert.equal(replay.turn.status, "completed");
  assert.equal(replay.assistantMessage.content, "Answer");
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 2);
  assert.equal(db._docs.get("students/s1/chats/c1").activeTurnId, null);
});

test("failed setup is durable and clears active chat metadata", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));

  const result = await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    status: "failed",
    finishReason: "error",
    errorCode: "chat/provider-not-configured",
  });

  assert.equal(result.turn.status, "failed");
  assert.equal(result.turn.errorCode, "chat/provider-not-configured");
  assert.equal(db._docs.get("students/s1/chats/c1").activeTurnId, null);
  assert.equal(db._docs.get("students/s1/chats/c1").lastTurnStatus, "failed");
  assert.equal(result.assistantMessage, null);
  assert.equal(result.assistantMessageCreated, false);
  assert.equal(db._docs.has("students/s1/chats/c1/messages/r1-assistant"), false);
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 1);
  assert.equal(db._docs.get("students/s1/chats/c1/messages/m1").content, "Hello");
});

test("an empty interrupted attempt remains turn-only while a completed response remains a message", async () => {
  const db = fakeDb();
  await acquireChatTurn(acquireInput(db));
  await startChatTurn({
    db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r1", model: "model", langfuseTraceId: "r1",
  });

  const interrupted = await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r1",
    status: "interrupted",
    finishReason: "client_disconnect",
  });

  assert.equal(interrupted.assistantMessageCreated, false);
  assert.equal(db._docs.has("students/s1/chats/c1/messages/r1-assistant"), false);

  await acquireChatTurn(acquireInput(db, { runId: "r2" }));
  await startChatTurn({
    db, studentId: "s1", chatId: "c1", turnId: "t1", runId: "r2", model: "model", langfuseTraceId: "r2",
  });
  const completed = await finalizeChatTurn({
    db,
    studentId: "s1",
    chatId: "c1",
    turnId: "t1",
    runId: "r2",
    status: "completed",
    finishReason: "stop",
  });

  assert.equal(completed.assistantMessageCreated, true);
  assert.equal(db._docs.get("students/s1/chats/c1/messages/r2-assistant").content, "");
  assert.equal(db._docs.get("students/s1/chats/c1").messageCount, 2);
});

test("acquireChatTurn rejects soft-deleted chats", async () => {
  const db = fakeDb();
  db._docs.set("students/s1/chats/c1", { deleted: true, createdBy: "u1" });

  await assert.rejects(
    () => acquireChatTurn(acquireInput(db)),
    (error) => error.code === "chat/deleted",
  );
  assert.equal(db._docs.size, 1);
});

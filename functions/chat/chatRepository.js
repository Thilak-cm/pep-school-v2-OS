import { transitionTurn } from "./chatTurnLifecycle.js";

const now = () => new Date();

function chatRef(db, studentId, chatId) {
  return db.collection("students").doc(studentId).collection("chats").doc(chatId);
}

export async function updateChatMetadata({ db, studentId, chatId, metadata }) {
  const ref = chatRef(db, studentId, chatId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error("Chat not found");
    tx.update(ref, { ...metadata, updatedAt: now() });
  });
}

function messageRef(db, studentId, chatId, messageId) {
  return chatRef(db, studentId, chatId).collection("messages").doc(messageId);
}

function turnRef(db, studentId, chatId, turnId) {
  return chatRef(db, studentId, chatId).collection("turns").doc(turnId);
}

export async function ensureChat({ db, studentId, chatId, createdBy, classroomId }) {
  const ref = chatRef(db, studentId, chatId);
  let created = false;
  let data;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      data = snapshot.data();
      return;
    }

    data = {
      studentId,
      classroomId,
      createdBy,
      visibility: "classroom",
      name: "New Chat",
      createdAt: now(),
      updatedAt: now(),
      deleted: false,
      messageCount: 0,
      lastMessagePreview: "",
    };
    tx.create(ref, data);
    created = true;
  });

  return { created, data };
}

export async function ensureUserMessage({
  db,
  studentId,
  chatId,
  messageId,
  turnId,
  content,
  authorId,
  authorName = null,
}) {
  const ref = messageRef(db, studentId, chatId, messageId);
  let created = false;
  let data;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      data = snapshot.data();
      return;
    }

    data = {
      turnId,
      role: "user",
      content: String(content).trim(),
      authorId,
      ...(authorName ? { authorName } : {}),
      createdAt: now(),
      status: "complete",
    };
    tx.create(ref, data);
    created = true;
  });

  return { created, data };
}

export async function createTurn({
  db,
  studentId,
  chatId,
  turnId,
  runId,
  userMessageId,
  assistantMessageId = null,
  idempotencyKey,
}) {
  const ref = turnRef(db, studentId, chatId, turnId);
  let data;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      data = snapshot.data();
      return;
    }

    data = {
      runId,
      userMessageId,
      ...(assistantMessageId ? { assistantMessageId } : {}),
      idempotencyKey,
      status: "persisting",
      createdAt: now(),
      updatedAt: now(),
    };
    tx.create(ref, data);
  });

  return data;
}

export async function updateTurnStatus({ db, studentId, chatId, turnId, status, metadata = {} }) {
  const ref = turnRef(db, studentId, chatId, turnId);
  let updated;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error("Turn not found");
    updated = transitionTurn(snapshot.data(), status, { ...metadata, updatedAt: now() });
    tx.update(ref, updated);
  });

  return updated;
}

export async function finalizeAssistantMessage({
  db,
  studentId,
  chatId,
  messageId,
  turnId,
  runId,
  content,
  status = "complete",
  finishReason = null,
  model = null,
}) {
  const ref = messageRef(db, studentId, chatId, messageId);
  let created = false;
  let data;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      data = snapshot.data();
      return;
    }

    data = {
      turnId,
      runId,
      role: "assistant",
      content: String(content || ""),
      status,
      ...(finishReason ? { finishReason } : {}),
      ...(model ? { model } : {}),
      createdAt: now(),
    };
    tx.create(ref, data);
    created = true;
  });

  return { created, data };
}

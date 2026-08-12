import {
  isActiveTurnStatus,
  isTerminalTurnStatus,
  transitionTurn,
} from "./chatTurnLifecycle.js";

const now = () => new Date();
const CHAT_TITLE_MAX_LENGTH = 60;

function chatRef(db, studentId, chatId) {
  return db.collection("students").doc(studentId).collection("chats").doc(chatId);
}

export async function updateChatMetadata({ db, studentId, chatId, metadata, messageCountDelta = 0 }) {
  const ref = chatRef(db, studentId, chatId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error("Chat not found");
    const current = snapshot.data() || {};
    tx.update(ref, {
      ...metadata,
      ...(messageCountDelta ? { messageCount: (current.messageCount || 0) + messageCountDelta } : {}),
      updatedAt: now(),
    });
  });
}

function messageRef(db, studentId, chatId, messageId) {
  return chatRef(db, studentId, chatId).collection("messages").doc(messageId);
}

function turnRef(db, studentId, chatId, turnId) {
  return chatRef(db, studentId, chatId).collection("turns").doc(turnId);
}

async function measuredRead(telemetry, name, operation) {
  const end = telemetry?.startStage?.(name) || (() => {});
  try {
    return await operation();
  } finally {
    end();
  }
}

export class ChatPersistenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChatPersistenceError";
    this.code = code;
  }
}

function conflict(message) {
  throw new ChatPersistenceError("chat/idempotency-conflict", message);
}

function assertUserMessageMatches(data, { turnId, content, authorId }) {
  if (data.role !== "user" || String(data.content || "").trim() !== String(content).trim()) {
    conflict("userMessageId is already associated with different content");
  }
  if (data.turnId !== turnId) {
    conflict("userMessageId is already associated with a different turn");
  }
  if (data.authorId && data.authorId !== authorId) {
    conflict("userMessageId is already associated with a different author");
  }
}

function assertLogicalTurnMatches(data, expected) {
  for (const field of ["userMessageId", "idempotencyKey"]) {
    if (data[field] !== expected[field]) {
      conflict(`turnId is already associated with a different ${field}`);
    }
  }
}

function assertTurnAttemptMatches(data, expected) {
  for (const field of ["runId", "assistantMessageId"]) {
    if (data[field] !== expected[field]) {
      conflict(`turnId has an active attempt with a different ${field}`);
    }
  }
}

function assertAssistantMessageMatches(data, { turnId, runId }) {
  if (data.role !== "assistant" || data.turnId !== turnId || data.runId !== runId) {
    conflict("assistant message ID is already associated with a different turn");
  }
}

export function deriveChatTitle(content) {
  const withoutControls = Array.from(String(content || ""), (character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  const sanitized = withoutControls
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) return "New Chat";
  const characters = Array.from(sanitized);
  if (characters.length <= CHAT_TITLE_MAX_LENGTH) return sanitized;
  return `${characters.slice(0, CHAT_TITLE_MAX_LENGTH - 1).join("").trimEnd()}…`;
}

function attemptFromTurn(turn) {
  if (!turn?.runId) return null;
  return {
    runId: turn.runId,
    assistantMessageId: turn.assistantMessageId || `${turn.runId}-assistant`,
    status: turn.status,
    createdAt: turn.createdAt || turn.updatedAt || now(),
    updatedAt: turn.updatedAt || turn.createdAt || now(),
    startedAt: turn.startedAt || null,
    completedAt: turn.completedAt || null,
    finishReason: turn.finishReason || null,
    errorCode: turn.errorCode || null,
    model: turn.model || null,
    langfuseTraceId: turn.langfuseTraceId || null,
  };
}

function turnAttempts(turn) {
  if (Array.isArray(turn?.attempts) && turn.attempts.length > 0) {
    return turn.attempts.map((attempt) => ({ ...attempt }));
  }
  const legacyAttempt = attemptFromTurn(turn);
  return legacyAttempt ? [legacyAttempt] : [];
}

function createAttempt({ runId, assistantMessageId, createdAt }) {
  return {
    runId,
    assistantMessageId,
    status: "persisting",
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    completedAt: null,
    finishReason: null,
    errorCode: null,
    model: null,
    langfuseTraceId: null,
  };
}

function updateAttempt(turn, runId, metadata) {
  const attempts = turnAttempts(turn);
  const index = attempts.findIndex((attempt) => attempt.runId === runId);
  if (index < 0) conflict("turn attempt history does not contain runId");
  attempts[index] = { ...attempts[index], ...metadata };
  return { ...turn, attempts };
}

/**
 * Atomically acquires a turn before any provider/config work. Replays return the
 * existing state; a new run may reuse the same matching user message without
 * incrementing the transcript count again.
 */
export async function acquireChatTurn({
  db,
  studentId,
  chatId,
  turnId,
  runId,
  userMessageId,
  content,
  authorId,
  authorName = null,
  classroomId,
  telemetry,
}) {
  const normalizedContent = String(content).trim();
  const chat = chatRef(db, studentId, chatId);
  const message = messageRef(db, studentId, chatId, userMessageId);
  const turn = turnRef(db, studentId, chatId, turnId);
  const assistantMessageId = `${runId}-assistant`;
  const assistant = messageRef(db, studentId, chatId, assistantMessageId);
  const idempotencyKey = `${chatId}:${userMessageId}`;
  let result;

  await db.runTransaction(async (tx) => {
    const [chatSnap, messageSnap, turnSnap, assistantSnap] = await Promise.all([
      measuredRead(telemetry, "chat_document_load", () => tx.get(chat)),
      tx.get(message),
      tx.get(turn),
      tx.get(assistant),
    ]);
    const chatData = chatSnap.exists ? chatSnap.data() || {} : null;
    const messageData = messageSnap.exists ? messageSnap.data() || {} : null;
    const turnData = turnSnap.exists ? turnSnap.data() || {} : null;

    if (chatData?.deleted === true) {
      throw new ChatPersistenceError("chat/deleted", "Chat has been deleted");
    }
    if (chatData?.studentId && chatData.studentId !== studentId) {
      conflict("chatId is already associated with a different student");
    }
    if (messageData) {
      assertUserMessageMatches(messageData, {
        turnId,
        content: normalizedContent,
        authorId,
      });
    }

    const expectedTurn = { runId, userMessageId, assistantMessageId, idempotencyKey };
    if (turnData) {
      assertLogicalTurnMatches(turnData, expectedTurn);
      if (!messageData) conflict("turnId references a missing user message");
      if (!isTerminalTurnStatus(turnData.status)) {
        assertTurnAttemptMatches(turnData, expectedTurn);
        if (assistantSnap.exists) {
          assertAssistantMessageMatches(assistantSnap.data() || {}, { turnId, runId });
        }
        result = {
          disposition: "active",
          turn: turnData,
          userMessage: messageData,
          assistantMessage: assistantSnap.exists ? assistantSnap.data() || {} : null,
        };
        return;
      }

      if (turnData.runId === runId) {
        assertTurnAttemptMatches(turnData, expectedTurn);
        if (assistantSnap.exists) {
          assertAssistantMessageMatches(assistantSnap.data() || {}, { turnId, runId });
        }
        result = {
          disposition: "terminal",
          turn: turnData,
          userMessage: messageData,
          assistantMessage: assistantSnap.exists ? assistantSnap.data() || {} : null,
        };
        return;
      }

      if (turnData.status === "completed") {
        conflict("a completed turn cannot be retried with a different runId");
      }
      if (turnAttempts(turnData).some((attempt) => attempt.runId === runId)) {
        conflict("runId was already used by an earlier attempt");
      }
      if (assistantSnap.exists) {
        conflict("runId is already associated with an assistant message");
      }
    }

    let previousTurnSnap = null;
    if (chatData?.activeTurnId && chatData.activeTurnId !== turnId) {
      previousTurnSnap = await tx.get(turnRef(db, studentId, chatId, chatData.activeTurnId));
      const previousTurn = previousTurnSnap.exists ? previousTurnSnap.data() || {} : null;
      if (!previousTurn || isActiveTurnStatus(previousTurn.status)) {
        throw new ChatPersistenceError(
          "chat/turn-active",
          "Another chat turn is already in progress",
        );
      }
    }

    const createdAt = now();
    const title = deriveChatTitle(normalizedContent);
    const userMessageData = messageData || {
      turnId,
      role: "user",
      content: normalizedContent,
      authorId,
      ...(authorName ? { authorName } : {}),
      createdAt,
      status: "complete",
    };
    const turnDataToPersist = {
      ...(turnData || {}),
      runId,
      userMessageId,
      assistantMessageId,
      idempotencyKey,
      status: "persisting",
      createdAt: turnData?.createdAt || createdAt,
      updatedAt: createdAt,
      startedAt: null,
      completedAt: null,
      finishReason: null,
      errorCode: null,
      model: null,
      langfuseTraceId: null,
      attempts: [
        ...turnAttempts(turnData),
        createAttempt({ runId, assistantMessageId, createdAt }),
      ],
    };

    if (!messageData) tx.create(message, userMessageData);
    if (turnData) tx.update(turn, turnDataToPersist);
    else tx.create(turn, turnDataToPersist);
    if (chatData) {
      tx.update(chat, {
        ...(!chatData.studentId ? { studentId } : {}),
        ...(!chatData.classroomId ? { classroomId } : {}),
        ...(!chatData.createdBy ? { createdBy: authorId } : {}),
        ...(!chatData.visibility ? { visibility: "classroom" } : {}),
        ...(!messageData && (chatData.messageCount || 0) === 0 &&
          (!chatData.name || chatData.name === "New Chat") ? { name: title } : {}),
        activeTurnId: turnId,
        lastTurnStatus: "persisting",
        messageCount: (chatData.messageCount || 0) + Number(!messageData),
        updatedAt: createdAt,
      });
    } else {
      tx.create(chat, {
        studentId,
        classroomId,
        createdBy: authorId,
        visibility: "classroom",
        name: title,
        createdAt,
        updatedAt: createdAt,
        deleted: false,
        messageCount: 1,
        lastMessagePreview: "",
        activeTurnId: turnId,
        lastTurnStatus: "persisting",
      });
    }

    result = {
      disposition: "acquired",
      turn: turnDataToPersist,
      userMessage: userMessageData,
      assistantMessage: null,
      userMessageCreated: !messageData,
    };
  });

  return result;
}

export async function startChatTurn({
  db,
  studentId,
  chatId,
  turnId,
  runId,
  model,
  langfuseTraceId,
}) {
  const chat = chatRef(db, studentId, chatId);
  const turn = turnRef(db, studentId, chatId, turnId);
  let result;

  await db.runTransaction(async (tx) => {
    const [chatSnap, turnSnap] = await Promise.all([tx.get(chat), tx.get(turn)]);
    if (!chatSnap.exists) throw new ChatPersistenceError("chat/not-found", "Chat not found");
    if (!turnSnap.exists) throw new ChatPersistenceError("chat/turn-not-found", "Turn not found");
    const chatData = chatSnap.data() || {};
    const turnData = turnSnap.data() || {};
    if (turnData.runId !== runId) conflict("turnId is already associated with a different runId");
    if (isTerminalTurnStatus(turnData.status)) {
      result = { started: false, turn: turnData };
      return;
    }
    if (chatData.activeTurnId !== turnId) {
      const interruptedAt = now();
      const interrupted = updateAttempt(transitionTurn(turnData, "interrupted", {
        finishReason: "superseded",
        completedAt: interruptedAt,
        updatedAt: interruptedAt,
      }), runId, {
        status: "interrupted",
        finishReason: "superseded",
        completedAt: interruptedAt,
        updatedAt: interruptedAt,
      });
      tx.update(turn, interrupted);
      result = { started: false, turn: interrupted };
      return;
    }

    const startedAt = now();
    const running = updateAttempt(transitionTurn(turnData, "running", {
      model,
      langfuseTraceId,
      startedAt,
      updatedAt: startedAt,
    }), runId, {
      status: "running",
      model,
      langfuseTraceId,
      startedAt,
      updatedAt: startedAt,
    });
    tx.update(turn, running);
    tx.update(chat, {
      activeTurnId: turnId,
      lastTurnStatus: "running",
      langfuseTraceId,
      updatedAt: startedAt,
    });
    result = { started: true, turn: running };
  });

  return result;
}

export async function finalizeChatTurn({
  db,
  studentId,
  chatId,
  turnId,
  runId,
  content = "",
  status,
  finishReason = null,
  errorCode = null,
  model = null,
  langfuseTraceId = null,
}) {
  const chat = chatRef(db, studentId, chatId);
  const turn = turnRef(db, studentId, chatId, turnId);
  const assistantMessageId = `${runId}-assistant`;
  const assistant = messageRef(db, studentId, chatId, assistantMessageId);
  let result;

  await db.runTransaction(async (tx) => {
    const [chatSnap, turnSnap, assistantSnap] = await Promise.all([
      tx.get(chat),
      tx.get(turn),
      tx.get(assistant),
    ]);
    if (!chatSnap.exists) throw new ChatPersistenceError("chat/not-found", "Chat not found");
    if (!turnSnap.exists) throw new ChatPersistenceError("chat/turn-not-found", "Turn not found");
    const chatData = chatSnap.data() || {};
    const turnData = turnSnap.data() || {};
    if (turnData.runId !== runId) conflict("turnId is already associated with a different runId");
    if (assistantSnap.exists) {
      assertAssistantMessageMatches(assistantSnap.data() || {}, { turnId, runId });
    }
    if (isTerminalTurnStatus(turnData.status)) {
      result = {
        turn: turnData,
        assistantMessage: assistantSnap.exists ? assistantSnap.data() || {} : null,
        assistantMessageCreated: false,
      };
      return;
    }

    const ownsActiveTurn = chatData.activeTurnId === turnId;
    const terminalStatus = ownsActiveTurn ? status : "interrupted";
    const terminalReason = ownsActiveTurn ? finishReason : "superseded";
    const completedAt = now();
    const terminalMetadata = {
      ...(terminalReason ? { finishReason: terminalReason } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(model ? { model } : {}),
      ...(langfuseTraceId ? { langfuseTraceId } : {}),
      completedAt,
      updatedAt: completedAt,
    };
    const terminalTurn = updateAttempt(
      transitionTurn(turnData, terminalStatus, terminalMetadata),
      runId,
      { ...terminalMetadata, status: terminalStatus },
    );
    const assistantContent = String(content || "");
    // A pre-token failure is execution state, not a transcript message. Keep
    // its retry identity on the durable turn and only add an assistant message
    // when the model completed or produced a prefix worth preserving.
    const shouldCreateAssistant = !assistantSnap.exists
      && (terminalStatus === "completed"
        || (terminalStatus === "interrupted" && assistantContent.length > 0));
    let assistantData = assistantSnap.exists ? assistantSnap.data() || {} : null;
    if (shouldCreateAssistant) {
      assistantData = {
        turnId,
        runId,
        role: "assistant",
        content: assistantContent,
        status: terminalStatus === "completed" ? "complete" : terminalStatus,
        ...(terminalReason ? { finishReason: terminalReason } : {}),
        ...(model ? { model } : {}),
        ...(terminalStatus !== "completed" ? {
          retry: {
            chatId,
            turnId,
            userMessageId: turnData.userMessageId,
          },
        } : {}),
        createdAt: completedAt,
      };
      tx.create(assistant, assistantData);
    }
    tx.update(turn, terminalTurn);
    if (ownsActiveTurn) {
      tx.update(chat, {
        activeTurnId: null,
        lastTurnStatus: terminalStatus,
        ...(errorCode ? { lastErrorCode: errorCode } : {}),
        ...(assistantData ? { lastMessagePreview: assistantData.content.slice(0, 100) } : {}),
        ...(langfuseTraceId ? { langfuseTraceId } : {}),
        messageCount: (chatData.messageCount || 0) + Number(shouldCreateAssistant),
        updatedAt: completedAt,
      });
    }
    result = {
      turn: terminalTurn,
      assistantMessage: assistantData,
      assistantMessageCreated: shouldCreateAssistant,
    };
  });

  return result;
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
  model = null,
  langfuseTraceId = null,
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
      ...(model ? { model } : {}),
      ...(langfuseTraceId ? { langfuseTraceId } : {}),
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

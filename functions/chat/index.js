import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";

import { db, auth } from "../shared/firebase.js";
import { OPENROUTER_API_KEY, getOpenRouterKey, OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { createLangfuse } from "../shared/langfuse.js";
import {
  CHAT_MODEL_INFO,
  CHAT_SYSTEM_PROMPT,
  DEFAULT_CHAT_MESSAGE_LIMIT,
  DEFAULT_OBSERVATION_LIMIT,
} from "../config/chatConstants.js";
import { DEFAULT_CHAT_TOOL_IDS } from "../config/toolCatalog.js";
import { createToolExecutor, getToolDefinitions, getTools } from "../shared/toolRegistry.js";
import {
  acquireChatTurn,
  finalizeChatTurn,
  startChatTurn,
} from "./chatRepository.js";
import { parseChatRequest } from "./chatRequest.js";
import { encodeSseEvent } from "./streamProtocol.js";
import { runStreamingAgentLoop } from "./openrouterStream.js";
import { buildChatMessages } from "./chatContext.js";

const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");

function corsOrigin(req) {
  return process.env.CHAT_ALLOWED_ORIGIN || req.headers.origin || "*";
}

function configureSse(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", corsOrigin(req));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.flushHeaders?.();
}

function sendEvent(res, event, data) {
  if (!res.writableEnded) res.write(encodeSseEvent(event, data));
}

async function verifyRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new Error("Authentication required");

  const decoded = await auth.verifyIdToken(token);
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) throw new Error("User profile not found");
  return { decoded, user: userSnap.data() || {} };
}

async function verifyStudentAccess(uid, user, studentId) {
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) throw new Error("Student not found");
  const student = studentSnap.data() || {};
  const classroomId = student.classroomId;
  const classroomSnap = classroomId
    ? await db.collection("classrooms").doc(classroomId).get()
    : null;
  const classroom = classroomSnap?.data() || {};

  const allowed = user.role === "superadmin"
    || classroom.teacherIds?.includes(uid)
    || (user.role === "classroomadmin" && user.manageableClassrooms?.includes(classroomId));
  if (!allowed) throw new Error("You do not have access to this student");
  return { classroomId, programId: classroom.programId || "primary" };
}

async function loadChatConfig(programId) {
  let snap;
  try {
    snap = await db.collection("config").doc(`chat_${programId}`).get();
  } catch (error) {
    error.code = error.code || "chat/config-unavailable";
    throw error;
  }
  const data = snap.exists ? snap.data() || {} : {};
  return {
    model: typeof data.model === "string" ? data.model : CHAT_MODEL_INFO.model,
    temperature: Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature,
    maxTokens: Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens,
    systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : CHAT_SYSTEM_PROMPT,
    historyLimit: Number.isFinite(data.chatMessageLimit)
      ? data.chatMessageLimit
      : DEFAULT_CHAT_MESSAGE_LIMIT,
    observationLimit: data.observationLimit === "all" || Number.isFinite(data.observationLimit)
      ? data.observationLimit
      : DEFAULT_OBSERVATION_LIMIT,
    allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools : DEFAULT_CHAT_TOOL_IDS,
  };
}

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorCode(error, interrupted = false) {
  if (interrupted) return "chat/client-disconnect";
  if (typeof error?.code === "string") return error.code;
  if (String(error?.message || "").startsWith("OpenRouter error:")) {
    return "chat/provider-error";
  }
  return "chat/internal-error";
}

function sendTerminalReplay(res, acquisition) {
  const { turn, assistantMessage } = acquisition;
  if (assistantMessage?.content) sendEvent(res, "token", { text: assistantMessage.content, replay: true });
  if (turn.status === "failed") {
    sendEvent(res, "error", {
      code: turn.errorCode || "chat/turn-failed",
      error: "This chat turn failed",
      status: turn.status,
      replay: true,
    });
    return;
  }
  sendEvent(res, "complete", {
    messageId: turn.assistantMessageId || null,
    status: turn.status === "completed" ? "complete" : turn.status,
    replay: true,
  });
}

export const childChatStream = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "512MB",
    secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", corsOrigin(req));
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    configureSse(req, res);
    let finished = false;
    const abortController = new AbortController();
    const abortOnDisconnect = () => {
      if (!finished) abortController.abort(new Error("client_disconnect"));
    };
    // `req.close` also fires after a normal POST body has been fully read, while
    // the SSE response is still open. Treating that as a disconnect aborts every
    // generation immediately. `aborted` is the request-side failure signal;
    // response `close` catches the browser leaving during the streamed reply.
    req.on("aborted", abortOnDisconnect);
    res.on("close", () => {
      if (!finished && !res.writableEnded) abortOnDisconnect();
    });

    let trace;
    let langfuseClient;
    let request;
    let context;
    let streamedContent = "";
    let acquired = false;
    let terminalStatus = null;
    let model = null;
    try {
      const { decoded, user } = await verifyRequest(req);
      request = parseChatRequest(req.body);
      context = await verifyStudentAccess(decoded.uid, user, request.studentId);

      const acquisition = await acquireChatTurn({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        runId: request.runId,
        userMessageId: request.userMessageId,
        content: request.message,
        authorId: decoded.uid,
        authorName: user.displayName || decoded.name || null,
        classroomId: context.classroomId,
      });
      if (acquisition.disposition === "terminal") {
        terminalStatus = acquisition.turn.status;
        sendTerminalReplay(res, acquisition);
        finished = true;
        res.end();
        return;
      }
      if (acquisition.disposition === "active") {
        terminalStatus = acquisition.turn.status;
        sendEvent(res, "error", {
          code: "chat/turn-active",
          error: "This chat turn is already in progress",
          status: acquisition.turn.status,
          retryable: true,
        });
        finished = true;
        res.end();
        return;
      }
      acquired = true;

      // Provider, config, and observability resolution deliberately happen only
      // after the durable persisting turn exists.
      const chatConfig = await loadChatConfig(context.programId);
      model = chatConfig.model;
      const apiKey = getOpenRouterKey();
      if (!apiKey) {
        throw runtimeError("chat/provider-not-configured", "OpenRouter key is not configured");
      }
      if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
        throw runtimeError(
          "chat/observability-not-configured",
          "Langfuse is required for chat model execution",
        );
      }
      langfuseClient = createLangfuse();
      trace = langfuseClient.trace({
        id: request.runId,
        sessionId: request.chatId,
        userId: decoded.uid,
        metadata: {
          turnId: request.turnId,
          model: chatConfig.model,
          userId: decoded.uid,
          userMessageId: request.userMessageId,
          assistantMessageId: acquisition.turn.assistantMessageId,
          studentId: request.studentId,
          classroomId: context.classroomId,
        },
      });
      if (!trace) {
        throw runtimeError("chat/observability-unavailable", "Langfuse trace could not be created");
      }
      const started = await startChatTurn({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        runId: request.runId,
        model: chatConfig.model,
        langfuseTraceId: request.runId,
      });
      if (!started.started) {
        terminalStatus = started.turn.status;
        sendEvent(res, "error", {
          code: "chat/turn-superseded",
          error: "This chat turn was interrupted by a newer request",
          status: terminalStatus,
        });
        finished = true;
        res.end();
        return;
      }

      sendEvent(res, "started", { chatId: request.chatId, turnId: request.turnId, runId: request.runId });
      const selectedTools = getTools(chatConfig.allowedTools, ["student"]);
      const boundArgs = { studentId: request.studentId, chatId: request.chatId };
      const toolDefinitions = getToolDefinitions(selectedTools, { boundArgs });
      const toolExecutor = createToolExecutor(selectedTools, { boundArgs });
      const messages = await buildChatMessages({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        currentMessage: request.message,
        userMessageId: request.userMessageId,
        basePrompt: chatConfig.systemPrompt,
        historyLimit: chatConfig.historyLimit,
        observationLimit: chatConfig.observationLimit,
      });

      const agentResult = await runStreamingAgentLoop({
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        signal: abortController.signal,
        model: chatConfig.model,
        temperature: chatConfig.temperature,
        maxTokens: chatConfig.maxTokens,
        messages,
        tools: toolDefinitions,
        toolExecutor,
        toolPrerequisites: Object.fromEntries(selectedTools.map((tool) => [
          tool.id,
          tool.prerequisites || [],
        ])),
        trace,
        onChunk: (text) => {
          streamedContent += text;
          sendEvent(res, "token", { text });
        },
        onToolCalls: (names) => {
          sendEvent(res, "tool_calls", { names });
        },
      });
      const content = agentResult.content;

      const interrupted = abortController.signal.aborted;
      const finishReason = interrupted ? "client_disconnect" : agentResult.finishReason;
      const finalized = await finalizeChatTurn({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        runId: request.runId,
        content,
        status: interrupted ? "interrupted" : "completed",
        finishReason,
        model: chatConfig.model,
        langfuseTraceId: request.runId,
      });
      terminalStatus = finalized.turn.status;

      sendEvent(res, "complete", {
        messageId: finalized.turn.assistantMessageId,
        status: terminalStatus === "completed" ? "complete" : terminalStatus,
      });
      finished = true;
      res.end();
    } catch (error) {
      const interrupted = abortController.signal.aborted;
      const code = errorCode(error, interrupted);
      if (request && context && acquired) {
        try {
          const finalized = await finalizeChatTurn({
            db,
            studentId: request.studentId,
            chatId: request.chatId,
            turnId: request.turnId,
            runId: request.runId,
            content: streamedContent,
            // Once any response text reached the user, preserve that durable
            // prefix as interrupted so a retry can start a fresh attempt without
            // representing the already-visible response as an unsent failure.
            status: interrupted || streamedContent.length > 0 ? "interrupted" : "failed",
            finishReason: interrupted ? "client_disconnect" : "error",
            errorCode: code,
            model,
            langfuseTraceId: trace ? request.runId : null,
          });
          terminalStatus = finalized.turn.status;
        } catch (persistError) {
          console.error("[childChatStream] failed to persist terminal state", persistError);
        }
      }
      sendEvent(res, "error", {
        code,
        error: error.message || "Chat request failed",
        status: terminalStatus || (interrupted ? "interrupted" : "failed"),
        retryable: code !== "chat/idempotency-conflict" && code !== "chat/deleted",
        persisted: acquired,
      });
      finished = true;
      res.end();
    } finally {
      try {
        trace?.update?.({
          output: { status: terminalStatus || "failed", streamedChars: streamedContent.length },
        });
      } catch (traceError) {
        console.error("[childChatStream] failed to close Langfuse trace", traceError);
      }
      try {
        await langfuseClient?.flushAsync?.();
      } catch (flushError) {
        console.error("[childChatStream] Langfuse flush failed", flushError);
      }
    }
  });

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";

import { db, auth } from "../shared/firebase.js";
import { OPENROUTER_API_KEY, getOpenRouterKey, OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { createLangfuse } from "../shared/langfuse.js";
import { CHAT_MODEL_INFO, CHAT_SYSTEM_PROMPT } from "../config/chatConstants.js";
import { createToolExecutor, getToolDefinitions, getTools } from "../shared/toolRegistry.js";
import {
  ensureChat,
  ensureUserMessage,
  createTurn,
  updateTurnStatus,
  finalizeAssistantMessage,
  updateChatMetadata,
} from "./chatRepository.js";
import { parseChatRequest } from "./chatRequest.js";
import { encodeSseEvent } from "./streamProtocol.js";
import { runStreamingAgentLoop } from "./openrouterStream.js";
import { buildChatMessages } from "./chatContext.js";

const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");
const DEFAULT_CHAT_TOOL_IDS = [
  "fetch_weekly_snapshot",
  "fetch_snapshot_history",
  "fetch_monthly_plan",
  "fetch_writing_analysis",
  "fetch_interviews",
  "fetch_observations",
  "fetch_media",
  "fetch_term_reports",
  "fetch_baseline_reports",
  "fetch_placements",
  "fetch_chat_history",
];

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
  const snap = await db.collection("config").doc(`chat_${programId}`).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    model: typeof data.model === "string" ? data.model : CHAT_MODEL_INFO.model,
    temperature: Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature,
    maxTokens: Number.isFinite(data.max_tokens) ? data.max_tokens : 4096,
    systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : CHAT_SYSTEM_PROMPT,
    historyLimit: Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : 12,
    allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools : DEFAULT_CHAT_TOOL_IDS,
    allowedToolScopes: Array.isArray(data.allowedToolScopes) ? data.allowedToolScopes : ["student"],
  };
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
    try {
      const { decoded, user } = await verifyRequest(req);
      request = parseChatRequest(req.body);
      context = await verifyStudentAccess(decoded.uid, user, request.studentId);

      const apiKey = getOpenRouterKey();
      if (!apiKey) throw new Error("OpenRouter key is not configured");

      const chatConfig = await loadChatConfig(context.programId);
      const assistantMessageId = `${request.runId}-assistant`;
      await ensureChat({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        createdBy: decoded.uid,
        classroomId: context.classroomId,
      });
      const userMessageResult = await ensureUserMessage({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        messageId: request.userMessageId,
        turnId: request.turnId,
        content: request.message,
        authorId: decoded.uid,
        authorName: user.displayName || decoded.name || null,
      });
      await createTurn({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        runId: request.runId,
        userMessageId: request.userMessageId,
        assistantMessageId,
        idempotencyKey: `${request.chatId}:${request.userMessageId}`,
      });
      await updateTurnStatus({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        status: "running",
        metadata: { startedAt: new Date() },
      });

      if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
        langfuseClient = createLangfuse();
        trace = langfuseClient.trace({
          id: request.runId,
          sessionId: request.chatId,
          userId: decoded.uid,
          metadata: {
            turnId: request.turnId,
            studentId: request.studentId,
            classroomId: context.classroomId,
          },
        });
      }

      sendEvent(res, "started", { chatId: request.chatId, turnId: request.turnId, runId: request.runId });
      const selectedTools = getTools(chatConfig.allowedTools, chatConfig.allowedToolScopes);
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
      const status = interrupted ? "interrupted" : "complete";
      const finishReason = interrupted ? "client_disconnect" : agentResult.finishReason;
      const assistantMessageResult = await finalizeAssistantMessage({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        messageId: assistantMessageId,
        turnId: request.turnId,
        runId: request.runId,
        content,
        status,
        finishReason,
        model: chatConfig.model,
      });
      await updateTurnStatus({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        turnId: request.turnId,
        status: interrupted ? "interrupted" : "completed",
        metadata: { finishReason, completedAt: new Date() },
      });
      await updateChatMetadata({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        metadata: {
          lastMessagePreview: content.slice(0, 100),
          activeTurnId: null,
          langfuseTraceId: request.runId,
        },
        messageCountDelta: Number(userMessageResult.created) + Number(assistantMessageResult.created),
      });

      sendEvent(res, "complete", { messageId: assistantMessageId, status });
      finished = true;
      res.end();
    } catch (error) {
      const interrupted = abortController.signal.aborted;
      if (request && context) {
        try {
          if (streamedContent) {
            await finalizeAssistantMessage({
              db,
              studentId: request.studentId,
              chatId: request.chatId,
              messageId: `${request.runId}-assistant`,
              turnId: request.turnId,
              runId: request.runId,
              content: streamedContent,
              status: "interrupted",
              finishReason: interrupted ? "client_disconnect" : "error",
            });
          }
          await updateTurnStatus({
            db,
            studentId: request.studentId,
            chatId: request.chatId,
            turnId: request.turnId,
            status: interrupted ? "interrupted" : "failed",
            metadata: { errorCode: error.message, completedAt: new Date() },
            });
        } catch (persistError) {
          console.error("[childChatStream] failed to persist terminal state", persistError);
        }
      }
      sendEvent(res, "error", { error: error.message || "Chat request failed" });
      finished = true;
      res.end();
    } finally {
      if (trace) trace.update?.({ output: { completed: true, streamedChars: streamedContent.length } });
      await langfuseClient?.flushAsync?.();
    }
  });

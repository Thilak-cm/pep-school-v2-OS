import * as functions from "firebase-functions/v1";

import { db, auth } from "../shared/firebase.js";
import { OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";
import { getOpenRouterKey, OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { createLangfuse } from "../shared/langfuse.js";
import { resolveModel } from "../shared/modelRegistry.js";
import {
  CHAT_MODEL_INFO,
  CHAT_SYSTEM_PROMPT,
  DEFAULT_CHAT_MESSAGE_LIMIT,
  DEFAULT_OBSERVATION_WINDOW_DAYS,
} from "../config/chatConstants.js";
import { DEFAULT_CHAT_TOOL_IDS } from "../config/toolCatalog.js";
import { createToolExecutor, getToolDefinitions, getTools } from "../shared/toolRegistry.js";
import {
  acquireChatTurn,
  finalizeChatTurn,
  startChatTurn,
} from "./chatRepository.js";
import { parseChatCorrelation, parseChatRequest } from "./chatRequest.js";
import { writeSseEvent } from "./streamProtocol.js";
import { runStreamingAgentLoop } from "./openrouterStream.js";
import { buildChatMessages } from "./chatContext.js";
import { ChatLatencyRecorder, jsonUtf8ByteLength } from "./chatTelemetry.js";
import { validateTelemetryErrorCategory } from "../config/chatTelemetry.js";
import { validateSystemPromptTemplate } from "./promptAssembly.js";

// LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY imported from shared/llm.js
let firstInvocation = true;

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

function sendEvent(res, event, data, telemetry) {
  writeSseEvent(res, event, data, telemetry);
}

async function verifyRequest(req, telemetry) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw runtimeError("auth/unauthenticated", "Authentication required");

  const endToken = telemetry?.startStage?.("auth_token_verify") || (() => {});
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    throw runtimeError("auth/unauthenticated", "Authentication required");
  } finally {
    endToken();
  }
  const endUser = telemetry?.startStage?.("user_lookup") || (() => {});
  let userSnap;
  try {
    userSnap = await db.collection("users").doc(decoded.uid).get();
  } finally {
    endUser();
  }
  if (!userSnap.exists) throw runtimeError("auth/user-profile-missing", "User profile not found");
  return { decoded, user: userSnap.data() || {} };
}

async function verifyStudentAccess(uid, user, studentId, telemetry) {
  const endStudent = telemetry?.startStage?.("student_lookup") || (() => {});
  let studentSnap;
  try {
    studentSnap = await db.collection("students").doc(studentId).get();
  } finally {
    endStudent();
  }
  if (!studentSnap.exists) throw runtimeError("chat/student-not-found", "Student not found");
  const student = studentSnap.data() || {};
  const classroomId = student.classroomId;
  const endClassroom = telemetry?.startStage?.("classroom_lookup") || (() => {});
  let classroomSnap;
  try {
    classroomSnap = classroomId ? await db.collection("classrooms").doc(classroomId).get() : null;
  } finally {
    endClassroom();
  }
  const classroom = classroomSnap?.data() || {};

  const endAccessDecision = telemetry?.startStage?.("access_decision") || (() => {});
  let allowed;
  try {
    allowed = user.role === "superadmin"
      || classroom.teacherIds?.includes(uid)
      || (user.role === "classroomadmin" && user.manageableClassrooms?.includes(classroomId));
  } finally {
    endAccessDecision();
  }
  if (!allowed) throw runtimeError("auth/permission-denied", "You do not have access to this student");
  return { classroomId, programId: classroom.programId || "primary" };
}

async function loadChatConfig(programId, telemetry) {
  const endConfig = telemetry?.startStage?.("chat_config_load", { cacheStatus: "miss" }) || (() => {});
  let snap;
  try {
    snap = await db.collection("config").doc(`chat_${programId}`).get();
  } catch (error) {
    endConfig();
    error.code = error.code || "chat/config-unavailable";
    throw error;
  }
  endConfig();
  const data = snap.exists ? snap.data() || {} : {};
  const configuredPrompt = typeof data.systemPrompt === "string" ? data.systemPrompt : "";
  const systemPrompt = validateSystemPromptTemplate(configuredPrompt).valid
    ? configuredPrompt
    : CHAT_SYSTEM_PROMPT;
  return {
    model: typeof data.model === "string" ? data.model : CHAT_MODEL_INFO.model,
    temperature: Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature,
    maxTokens: Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens,
    systemPrompt,
    historyLimit: Number.isFinite(data.chatMessageLimit)
      ? data.chatMessageLimit
      : DEFAULT_CHAT_MESSAGE_LIMIT,
    observationWindowDays: Number.isFinite(data.observationWindowDays)
      ? data.observationWindowDays
      : DEFAULT_OBSERVATION_WINDOW_DAYS,
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
  if (typeof error?.code === "string") {
    try {
      return validateTelemetryErrorCategory(error.code);
    } catch {
      return "chat/internal-error";
    }
  }
  if (String(error?.message || "").startsWith("OpenRouter error:")) {
    return "chat/provider-error";
  }
  return "chat/internal-error";
}

function sendTerminalReplay(res, acquisition, telemetry) {
  const { turn, assistantMessage } = acquisition;
  if (turn.status === "completed") {
    telemetry.setOutcome("completed");
  } else if (turn.status === "interrupted") {
    telemetry.setOutcome("interrupted", turn.errorCode || "chat/replay-interrupted");
  } else {
    telemetry.setOutcome("failed", turn.errorCode || "chat/turn-failed");
  }
  if (assistantMessage?.content) {
    sendEvent(res, "token", { text: assistantMessage.content, replay: true }, telemetry);
  }
  if (turn.status === "failed") {
    sendEvent(res, "error", {
      code: turn.errorCode || "chat/turn-failed",
      error: "This chat turn failed",
      status: turn.status,
      replay: true,
      timing: telemetry.snapshot(),
    }, telemetry);
    return;
  }
  sendEvent(res, "complete", {
    messageId: turn.assistantMessageId || null,
    status: turn.status === "completed" ? "complete" : turn.status,
    replay: true,
    timing: telemetry.snapshot(),
  }, telemetry);
}

export const childChatStream = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "512MB",
    secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .https.onRequest(async (req, res) => {
    const coldInstance = firstInvocation;
    firstInvocation = false;
    const telemetry = new ChatLatencyRecorder({ coldInstance });
    telemetry.setDimensions({
      functionRegion: "asia-south1",
      requestBytes: jsonUtf8ByteLength(req.body || {}),
      requestKind: req.method === "OPTIONS" ? "cors_preflight" :
        (req.method === "POST" ? "chat_post" : "unsupported_method"),
    });
    if (req.method === "OPTIONS") {
      const endPreflight = telemetry.startStage("cors_preflight");
      res.setHeader("Access-Control-Allow-Origin", corsOrigin(req));
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      endPreflight({ httpStatus: 204 });
      telemetry.setDimensions({ httpStatus: 204 });
      telemetry.setOutcome("completed");
      telemetry.mark("request_complete");
      telemetry.emit(functions.logger);
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      telemetry.setDimensions({ httpStatus: 405 });
      telemetry.setOutcome("failed", "chat/method-not-allowed");
      telemetry.mark("request_complete");
      telemetry.emit(functions.logger);
      return;
    }

    const endSseHeaders = telemetry.startStage("sse_headers");
    configureSse(req, res);
    endSseHeaders();
    let finished = false;
    const abortController = new AbortController();
    let disconnectRecorded = false;
    const abortOnDisconnect = () => {
      if (!finished && !disconnectRecorded) {
        disconnectRecorded = true;
        const endDisconnect = telemetry.startStage("disconnect_abort_handling");
        telemetry.mark("client_disconnect");
        abortController.abort(new Error("client_disconnect"));
        endDisconnect();
      }
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
      const endCorrelation = telemetry.startStage("correlation_parsing");
      let correlation;
      try {
        correlation = parseChatCorrelation(
          req.body,
          (runCorrelation) => telemetry.setCorrelation(runCorrelation),
        );
      } finally {
        endCorrelation();
      }
      telemetry.setCorrelation(correlation);
      const { decoded, user } = await verifyRequest(req, telemetry);
      const endValidation = telemetry.startStage("request_validation");
      try {
        request = parseChatRequest(req.body);
      } finally {
        endValidation();
      }
      context = await verifyStudentAccess(decoded.uid, user, request.studentId, telemetry);
      telemetry.setDimensions({ programId: context.programId });

      const endAcquisition = telemetry.startStage("turn_acquisition");
      let acquisition;
      try {
        acquisition = await acquireChatTurn({
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
          telemetry,
        });
      } finally {
        endAcquisition();
      }
      if (acquisition.disposition === "terminal") {
        terminalStatus = acquisition.turn.status;
        sendTerminalReplay(res, acquisition, telemetry);
        finished = true;
        res.end();
        return;
      }
      if (acquisition.disposition === "active") {
        terminalStatus = acquisition.turn.status;
        telemetry.setOutcome("failed", "chat/turn-active");
        sendEvent(res, "error", {
          code: "chat/turn-active",
          error: "This chat turn is already in progress",
          status: acquisition.turn.status,
          retryable: true,
          timing: telemetry.snapshot(),
        }, telemetry);
        finished = true;
        res.end();
        return;
      }
      acquired = true;

      // Provider, config, and observability resolution deliberately happen only
      // after the durable persisting turn exists.
      const chatConfig = await loadChatConfig(context.programId, telemetry);
      model = await resolveModel("chat", chatConfig.model);
      telemetry.setDimensions({ model });
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
      const endTrace = telemetry.startStage("langfuse_trace_create");
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
        endTrace();
        throw runtimeError("chat/observability-unavailable", "Langfuse trace could not be created");
      }
      endTrace();
      telemetry.attachTrace(trace);
      const endStartTurn = telemetry.startStage("turn_start_transaction");
      let started;
      try {
        started = await startChatTurn({
          db,
          studentId: request.studentId,
          chatId: request.chatId,
          turnId: request.turnId,
          runId: request.runId,
          model: chatConfig.model,
          langfuseTraceId: request.runId,
        });
      } finally {
        endStartTurn();
      }
      if (!started.started) {
        terminalStatus = started.turn.status;
        telemetry.setOutcome("interrupted", "chat/turn-superseded");
        sendEvent(res, "error", {
          code: "chat/turn-superseded",
          error: "This chat turn was interrupted by a newer request",
          status: terminalStatus,
          timing: telemetry.snapshot(),
        }, telemetry);
        finished = true;
        res.end();
        return;
      }

      const endStartedEvent = telemetry.startStage("started_sse_emit");
      sendEvent(
        res,
        "started",
        { chatId: request.chatId, turnId: request.turnId, runId: request.runId },
        telemetry,
      );
      endStartedEvent();
      const endTools = telemetry.startStage("tool_schema_construction");
      const selectedTools = getTools(chatConfig.allowedTools, ["student"]);
      const boundArgs = { studentId: request.studentId, chatId: request.chatId };
      const toolDefinitions = getToolDefinitions(selectedTools, { boundArgs });
      const toolExecutor = createToolExecutor(selectedTools, { boundArgs });
      const toolSchemaChars = JSON.stringify(toolDefinitions).length;
      endTools({ selectedToolCount: selectedTools.length, toolSchemaChars });
      telemetry.setDimensions({
        selectedToolCount: selectedTools.length,
        toolSchemaChars,
        toolNames: selectedTools.map((tool) => tool.id),
      });
      const messages = await buildChatMessages({
        db,
        studentId: request.studentId,
        chatId: request.chatId,
        currentMessage: request.message,
        userMessageId: request.userMessageId,
        basePrompt: chatConfig.systemPrompt,
        historyLimit: chatConfig.historyLimit,
        observationWindowDays: chatConfig.observationWindowDays,
        telemetry,
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
        telemetry,
        onChunk: (text) => {
          streamedContent += text;
          sendEvent(res, "token", { text }, telemetry);
        },
        onToolCalls: (names) => {
          sendEvent(res, "tool_calls", { names }, telemetry);
        },
      });
      const content = agentResult.content;

      const interrupted = abortController.signal.aborted;
      const finishReason = interrupted ? "client_disconnect" : agentResult.finishReason;
      telemetry.setDimensions({ finishReason, clientDisconnected: interrupted });
      const endFinalize = telemetry.startStage("final_persistence_transaction");
      const endAssistantPersistence = telemetry.startStage("assistant_message_persistence");
      let finalized;
      try {
        finalized = await finalizeChatTurn({
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
      } finally {
        endAssistantPersistence(finalized ? {
          count: Number(finalized.assistantMessageCreated),
        } : {});
        endFinalize();
      }
      terminalStatus = finalized.turn.status;
      telemetry.setOutcome(
        interrupted ? "interrupted" : "completed",
        interrupted ? "chat/client-disconnect" : null,
      );

      const endTerminal = telemetry.startStage("terminal_sse_emit");
      sendEvent(res, "complete", {
        messageId: finalized.turn.assistantMessageId,
        status: terminalStatus === "completed" ? "complete" : terminalStatus,
        timing: telemetry.snapshot(),
      }, telemetry);
      endTerminal();
      telemetry.mark("terminal_sse");
      finished = true;
      res.end();
    } catch (error) {
      const interrupted = abortController.signal.aborted;
      const code = errorCode(error, interrupted);
      telemetry.setDimensions({ clientDisconnected: interrupted });
      telemetry.setOutcome(interrupted ? "interrupted" : "failed", code);
      if (request && context && acquired) {
        try {
          const endFailurePersistence = telemetry.startStage("failure_persistence_transaction");
          const endAssistantPersistence = telemetry.startStage("assistant_message_persistence");
          let finalized;
          try {
            finalized = await finalizeChatTurn({
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
          } finally {
            endAssistantPersistence(finalized ? {
              count: Number(finalized.assistantMessageCreated),
            } : {});
            endFailurePersistence();
          }
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
        timing: telemetry.snapshot(),
      }, telemetry);
      telemetry.mark("terminal_sse");
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
        const endFlush = telemetry.startStage("langfuse_flush");
        try {
          await langfuseClient?.flushAsync?.();
        } finally {
          endFlush();
        }
      } catch (flushError) {
        console.error("[childChatStream] Langfuse flush failed", flushError);
      } finally {
        telemetry.mark("request_complete");
        telemetry.setDimensions({
          httpStatus: res.statusCode || 200,
          streamedChars: streamedContent.length,
        });
        telemetry.emit(functions.logger);
      }
    }
  });

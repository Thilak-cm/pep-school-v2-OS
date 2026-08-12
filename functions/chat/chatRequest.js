import { validateOpaqueTelemetryId } from "../config/chatTelemetry.js";

const MAX_MESSAGE_LENGTH = 20_000;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalidRequest(message) {
  const error = new Error(message);
  error.code = "chat/invalid-request";
  return error;
}

function requiredCorrelationId(body, field) {
  try {
    return validateOpaqueTelemetryId(body?.[field], field);
  } catch {
    throw invalidRequest(`${field} is required`);
  }
}

function requiredResourceId(body, field) {
  const value = body?.[field];
  if (typeof value !== "string" || !RESOURCE_ID_PATTERN.test(value)) {
    throw invalidRequest(`${field} is required`);
  }
  return value;
}

export function parseChatCorrelation(body = {}, attachCorrelation = () => {}) {
  const runId = requiredCorrelationId(body, "runId");
  // Preserve server-side correlation even when optional client telemetry is
  // malformed and the request must be rejected before authentication.
  attachCorrelation({ runId });
  let clientTurnId = null;
  try {
    if (body.clientTurnId != null) {
      clientTurnId = validateOpaqueTelemetryId(body.clientTurnId, "clientTurnId");
    }
  } catch {
    throw invalidRequest("clientTurnId is invalid");
  }
  return {
    runId,
    clientTurnId,
  };
}

export function parseChatRequest(body = {}) {
  const correlation = parseChatCorrelation(body);
  const studentId = requiredResourceId(body, "studentId");
  const chatId = requiredResourceId(body, "chatId");
  const turnId = requiredResourceId(body, "turnId");
  const userMessageId = requiredResourceId(body, "userMessageId");

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) throw invalidRequest("message is required");
  if (message.length > MAX_MESSAGE_LENGTH) throw invalidRequest("message is too long");

  return {
    studentId,
    chatId,
    turnId,
    runId: correlation.runId,
    userMessageId,
    clientTurnId: correlation.clientTurnId,
    message,
  };
}

export { MAX_MESSAGE_LENGTH };

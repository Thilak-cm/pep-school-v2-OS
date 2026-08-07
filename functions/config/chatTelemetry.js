export const CHAT_TELEMETRY_SCHEMA_VERSION = 1;
export const CHAT_CLIENT_TELEMETRY_MAX_BYTES = 32_768;
export const CHAT_CLIENT_QUEUE_LIMIT = 100;
export const CHAT_CLIENT_QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CHAT_CLIENT_MILESTONE_KEYS = Object.freeze([
  "send",
  "pendingPersisted",
  "tokenReady",
  "requestStarted",
  "responseHeaders",
  "firstSseEvent",
  "firstTextToken",
  "firstVisibleToken",
  "terminalEvent",
  "uiSettled",
  "conversationRefreshCompleted",
  "telemetryAttempted",
  "telemetryAcknowledged",
]);

export const CHAT_CLIENT_DIMENSION_KEYS = Object.freeze([
  "appVersion",
  "programId",
  "visibilityAtSend",
  "visibilityAtTerminal",
  "onlineAtSend",
  "onlineAtTerminal",
  "networkEffectiveType",
  "networkRtt",
  "networkDownlink",
  "networkSaveData",
  "requestAttemptCount",
  "authRetryCount",
  "sseEventCount",
  "responseBytes",
  "firstVisibleReached",
  "durableQueueAvailable",
]);

export const CHAT_TERMINAL_OUTCOMES = Object.freeze([
  "completed",
  "failed",
  "interrupted",
  "aborted",
]);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "clientTurnId",
  "attemptRunIds",
  "attempts",
  "finalRunId",
  "milestones",
  "dimensions",
  "outcome",
  "errorCategory",
  "createdAtMs",
]);
const MILESTONE_KEYS = new Set(CHAT_CLIENT_MILESTONE_KEYS);
const DIMENSION_KEYS = new Set(CHAT_CLIENT_DIMENSION_KEYS);
const OUTCOMES = new Set(CHAT_TERMINAL_OUTCOMES);
const ATTEMPT_KEYS = new Set([
  "runId", "authRetry", "started", "tokenReady", "requestStarted", "responseHeaders",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${label}.${unknown} is not allowed`);
}

function cleanId(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error(`${label} must be a non-empty identifier`);
  }
  return value.trim();
}

function cleanNumber(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 86_400_000) {
    throw new Error(`${label} must be a non-negative finite duration`);
  }
  return Math.round(value * 1000) / 1000;
}

function cleanTimestamp(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000_000_000) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return Math.round(value);
}

function cleanDimension(key, value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.length <= 128) return value;
  throw new Error(`dimensions.${key} has an invalid value`);
}

export function validateClientTelemetryPayload(input) {
  const serialized = JSON.stringify(input ?? null);
  if (serialized.length > CHAT_CLIENT_TELEMETRY_MAX_BYTES) {
    throw new Error("telemetry payload is too large");
  }
  assertExactKeys(input, ROOT_KEYS, "payload");
  if (input.schemaVersion !== CHAT_TELEMETRY_SCHEMA_VERSION) {
    throw new Error("unsupported telemetry schema version");
  }

  const attemptRunIds = Array.isArray(input.attemptRunIds)
    ? input.attemptRunIds.map((value, index) => cleanId(value, `attemptRunIds[${index}]`))
    : [];
  if (attemptRunIds.length > 4) throw new Error("too many request attempts");
  const attempts = Array.isArray(input.attempts) ? input.attempts.map((attempt, index) => {
    assertExactKeys(attempt, ATTEMPT_KEYS, `attempts[${index}]`);
    if (typeof attempt.authRetry !== "boolean") throw new Error(`attempts[${index}].authRetry must be boolean`);
    const output = {
      runId: cleanId(attempt.runId, `attempts[${index}].runId`),
      authRetry: attempt.authRetry,
    };
    for (const key of ["started", "tokenReady", "requestStarted", "responseHeaders"]) {
      if (attempt[key] != null) output[key] = cleanNumber(attempt[key], `attempts[${index}].${key}`);
    }
    return output;
  }) : [];
  if (attempts.length > 4) throw new Error("too many request attempts");
  if (attempts.some((attempt, index) => attempt.runId !== attemptRunIds[index])) {
    throw new Error("attempt IDs must match attemptRunIds order");
  }

  assertExactKeys(input.milestones || {}, MILESTONE_KEYS, "milestones");
  const milestones = Object.fromEntries(Object.entries(input.milestones || {})
    .map(([key, value]) => [key, cleanNumber(value, `milestones.${key}`)]));

  assertExactKeys(input.dimensions || {}, DIMENSION_KEYS, "dimensions");
  const dimensions = Object.fromEntries(Object.entries(input.dimensions || {})
    .map(([key, value]) => [key, cleanDimension(key, value)]));

  if (!OUTCOMES.has(input.outcome)) throw new Error("invalid terminal outcome");
  const errorCategory = input.errorCategory == null
    ? null
    : cleanId(input.errorCategory, "errorCategory");
  const createdAtMs = input.createdAtMs == null
    ? null
    : cleanTimestamp(input.createdAtMs, "createdAtMs");

  return {
    schemaVersion: input.schemaVersion,
    eventId: cleanId(input.eventId, "eventId"),
    clientTurnId: cleanId(input.clientTurnId, "clientTurnId"),
    attemptRunIds,
    attempts,
    finalRunId: cleanId(input.finalRunId, "finalRunId", { nullable: true }),
    milestones,
    dimensions,
    outcome: input.outcome,
    errorCategory,
    ...(createdAtMs == null ? {} : { createdAtMs }),
  };
}

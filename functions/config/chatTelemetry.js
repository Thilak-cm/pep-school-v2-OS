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

export const CHAT_ATTEMPT_OUTCOMES = Object.freeze([
  "completed",
  "failed",
  "interrupted",
  "aborted",
]);

const OPAQUE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ERROR_CATEGORY_PATTERN = /^[a-z][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PROGRAM_IDS = new Set(["toddler", "primary", "elementary", "adolescent", "unknown"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "prerender", "unknown"]);
const NETWORK_EFFECTIVE_TYPES = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);

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
const ATTEMPT_OUTCOMES = new Set(CHAT_ATTEMPT_OUTCOMES);
const ATTEMPT_KEYS = new Set([
  "runId", "authRetry", "started", "tokenReady", "requestStarted", "responseHeaders",
  "terminalEvent", "outcome", "errorCategory",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${label}.${unknown} is not allowed`);
}

export function validateOpaqueTelemetryId(value, label = "identifier", { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || !OPAQUE_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be an opaque identifier`);
  }
  return value;
}

function cleanId(value, label, options) {
  return validateOpaqueTelemetryId(value, label, options);
}

export function validateTelemetryErrorCategory(value, label = "errorCategory", { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value.length > 128 || !ERROR_CATEGORY_PATTERN.test(value)) {
    throw new Error(`${label} must be a stable error category`);
  }
  return value;
}

function cleanErrorCategory(value, label, options) {
  return validateTelemetryErrorCategory(value, label, options);
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
  if (["onlineAtSend", "onlineAtTerminal", "networkSaveData", "firstVisibleReached",
    "durableQueueAvailable"].includes(key)) {
    if (typeof value === "boolean") return value;
  } else if (["networkRtt", "networkDownlink", "requestAttemptCount", "authRetryCount",
    "sseEventCount", "responseBytes"].includes(key)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  } else if (key === "appVersion" && typeof value === "string" && SEMVER_PATTERN.test(value)) {
    return value;
  } else if (key === "programId" && PROGRAM_IDS.has(value)) {
    return value;
  } else if (["visibilityAtSend", "visibilityAtTerminal"].includes(key)
    && VISIBILITY_STATES.has(value)) {
    return value;
  } else if (key === "networkEffectiveType" && NETWORK_EFFECTIVE_TYPES.has(value)) {
    return value;
  }
  throw new Error(`dimensions.${key} has an invalid value`);
}

export function validateClientTelemetryPayload(input) {
  const serialized = JSON.stringify(input ?? null);
  if (new TextEncoder().encode(serialized).byteLength > CHAT_CLIENT_TELEMETRY_MAX_BYTES) {
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
    if (attempt.terminalEvent != null) {
      output.terminalEvent = cleanNumber(attempt.terminalEvent, `attempts[${index}].terminalEvent`);
    }
    if (!ATTEMPT_OUTCOMES.has(attempt.outcome)) {
      throw new Error(`attempts[${index}].outcome is invalid`);
    }
    output.outcome = attempt.outcome;
    output.errorCategory = attempt.errorCategory == null
      ? null
      : cleanErrorCategory(attempt.errorCategory, `attempts[${index}].errorCategory`);
    if ((output.outcome === "completed") !== (output.errorCategory === null)) {
      throw new Error(`attempts[${index}] outcome and errorCategory are inconsistent`);
    }
    return output;
  }) : [];
  if (attempts.length > 4) throw new Error("too many request attempts");
  if (attempts.length !== attemptRunIds.length) {
    throw new Error("attempts must match attemptRunIds length");
  }
  if (new Set(attemptRunIds).size !== attemptRunIds.length) {
    throw new Error("attempt IDs must be unique");
  }
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
    : cleanErrorCategory(input.errorCategory, "errorCategory");
  const createdAtMs = input.createdAtMs == null
    ? null
    : cleanTimestamp(input.createdAtMs, "createdAtMs");
  const finalRunId = cleanId(input.finalRunId, "finalRunId", { nullable: true });
  const expectedFinalRunId = attemptRunIds.at(-1) || null;
  if (finalRunId !== expectedFinalRunId) {
    throw new Error("finalRunId must identify the final request attempt");
  }
  if ((input.outcome === "completed") !== (errorCategory === null)) {
    throw new Error("outcome and errorCategory are inconsistent");
  }
  if (dimensions.requestAttemptCount !== attemptRunIds.length) {
    throw new Error("requestAttemptCount must match request attempts");
  }
  const authRetryCount = attempts.filter((attempt) => attempt.authRetry).length;
  if (dimensions.authRetryCount !== authRetryCount) {
    throw new Error("authRetryCount must match request attempts");
  }
  if (attempts[0]?.authRetry || attempts.slice(1).some((attempt) => !attempt.authRetry)) {
    throw new Error("authRetry flags must match attempt order");
  }
  if (dimensions.firstVisibleReached !== (milestones.firstVisibleToken != null)) {
    throw new Error("firstVisibleReached must match firstVisibleToken");
  }
  if (attempts.length > 0 && attempts.at(-1).outcome !== input.outcome) {
    throw new Error("final attempt outcome must match terminal outcome");
  }

  return {
    schemaVersion: input.schemaVersion,
    eventId: cleanId(input.eventId, "eventId"),
    clientTurnId: cleanId(input.clientTurnId, "clientTurnId"),
    attemptRunIds,
    attempts,
    finalRunId,
    milestones,
    dimensions,
    outcome: input.outcome,
    errorCategory,
    ...(createdAtMs == null ? {} : { createdAtMs }),
  };
}

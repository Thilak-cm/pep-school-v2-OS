const PROJECT_ID = "pep-os";
const FUNCTION_NAMES = {
  client: "chatClientTelemetry",
  server: "childChatStream",
  preflight: "childChatStream",
};
const STATS_FUNCTION_NAMES = ["updateStatsDelta", "reconcileStats"];
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 2000;
const DEFAULT_LOOKBACK_MINUTES = 60;

const EVENT_NAMES = {
  client: "chat_client_latency",
  server: "chat_server_latency",
  preflight: "chat_server_latency",
};

const DIMENSION_FIELDS = [
  "model", "toolSchemaChars", "observationsIncluded", "functionRegion",
  "clientTurnIdPresent", "reasoningTokens", "coldInstance", "historyIncluded",
  "streamedChars", "promptChars", "providerResponseBytes", "finishReason",
  "provider", "toolNames", "requestKind", "modelIterationCount", "outputTokens",
  "inputTokens", "selectedToolCount", "cacheTokens", "promptMessageCount",
  "historyChars", "toolCallCount", "clientDisconnected", "sseResponseBytes",
  "programId", "observationsFetched", "observationsDiscarded", "observationTruncationReason",
  "observationChars", "configKey",
];

const SAFE_ROOT_FIELDS = [
  "eventId", "timestamp", "eventName", "schemaVersion", "runId", "clientTurnId",
  "startedAt", "endedAt", "outcome", "finishReason", "stages", "milestones",
  "dimensions", "attemptRunIds", "attempts", "finalRunId",
];

const SAFE_NESTED_FIELDS = {
  dimensions: new Set(DIMENSION_FIELDS),
};
const STAGE_FIELDS = new Set([
  "startOffsetMs", "endOffsetMs", "startedAt", "endedAt", "durationMs",
  ...DIMENSION_FIELDS,
]);
const MILESTONE_FIELDS = new Set(["offsetMs", ...DIMENSION_FIELDS]);
const FLAT_MILESTONE_FIELDS = new Set([
  "send", "requestStarted", "tokenReady", "firstSseEvent", "firstTextToken",
  "firstVisibleToken", "terminalEvent", "responseHeaders", "uiSettled",
  "conversationRefreshCompleted", "pendingPersisted", "telemetryAttempted",
]);
const ATTEMPT_FIELDS = new Set([
  "runId", "authRetry", "started", "tokenReady", "requestStarted", "responseHeaders",
  "terminalEvent", "outcome", "errorCategory",
]);

export { MAX_LOOKBACK_MS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

function iso(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid ISO timestamp`);
  return date;
}

export function normalizeTimeWindow(params = {}, now = new Date()) {
  if (params.lookbackMinutes !== undefined && (!Number.isFinite(Number(params.lookbackMinutes)) || Number(params.lookbackMinutes) <= 0)) {
    throw new Error("lookbackMinutes must be greater than zero");
  }
  const end = params.endTime ? iso(params.endTime, "endTime") : new Date(now);
  const start = params.startTime
    ? iso(params.startTime, "startTime")
    : new Date(end.getTime() - (params.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES) * 60 * 1000);
  if (start >= end) throw new Error("startTime must be before endTime");
  if (end > new Date(now).getTime() + 60_000) throw new Error("endTime cannot be in the future");
  if (end.getTime() - start.getTime() > MAX_LOOKBACK_MS) throw new Error("time window cannot exceed 7 days");
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function quote(value) {
  return JSON.stringify(String(value));
}

function buildRecomputeStatsLoggingFilter(params = {}) {
  if (params.query || params.logName || params.resource) throw new Error("unsupported arbitrary logging query");
  const window = params.startTime && params.endTime
    ? normalizeTimeWindow(params, new Date(params.endTime))
    : normalizeTimeWindow(params);
  return [
    `resource.type = "cloud_function"`,
    `(${STATS_FUNCTION_NAMES.map((name) => `resource.labels.function_name = ${quote(name)}`).join(" OR ")})`,
    `timestamp >= ${quote(window.startTime)}`,
    `timestamp <= ${quote(window.endTime)}`,
  ].join(" AND ");
}

function sanitizeRecomputeStatsLog(entry = {}) {
  const metadata = entry.metadata || entry;
  const resource = metadata.resource || entry.resource || {};
  const labels = resource.labels || {};
  const textPayload = typeof entry.data === "string"
    ? entry.data
    : typeof entry.data?.textPayload === "string"
      ? entry.data.textPayload
      : typeof entry.textPayload === "string" ? entry.textPayload : undefined;
  const payload = entry.data?.jsonPayload || entry.jsonPayload;
  const safePayload = payload && typeof payload === "object"
    ? Object.fromEntries(Object.entries(payload).filter(([key]) => [
      "event", "classroomCount", "computeTimeMs", "observationCount", "callerRole", "actionCount", "runId",
    ].includes(key)))
    : undefined;
  const result = {
    eventId: metadata.insertId,
    timestamp: metadata.timestamp ? new Date(metadata.timestamp).toISOString() : undefined,
    severity: metadata.severity || "DEFAULT",
    executionId: metadata.labels?.execution_id,
    functionName: labels.function_name || labels.functionName || STATS_FUNCTION_NAMES[0],
    region: labels.region || null,
  };
  if (textPayload) result.textPayload = textPayload.slice(0, 1000);
  if (safePayload && Object.keys(safePayload).length) result.jsonPayload = safePayload;
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}

function classifyRecomputeStatsLog(entry) {
  const text = entry.textPayload || "";
  if (/heap limit|out of memory/i.test(text)) return "oom";
  if (/finished with status:/.test(text)) return /status code: [23]\d\d/.test(text) ? "completed" : "failed";
  if (/execution started/.test(text)) return "started";
  return "log";
}

function namedFilter(field, values, type = "string") {
  if (!values?.length) return "";
  return `(${values.map((value) => `jsonPayload.${field} = ${type === "boolean" ? Boolean(value) : quote(value)}`).join(" OR ")})`;
}

function isTargetFunction(entry) {
  const labels = entry?.resource?.labels || entry?.metadata?.resource?.labels || {};
  const functionName = labels.function_name || labels.functionName;
  return !functionName || Object.values(FUNCTION_NAMES).includes(functionName);
}

function authRecoveryError(error) {
  const message = String(error?.message || error || "");
  if (/(authentication|unauthenticated|permission denied|invalid credential|could not load the default credentials|login required|oauth)/i.test(message)) {
    return new Error("Cloud Logging authentication is required. Please run `gcloud auth login` (and, if ADC is needed, `gcloud auth application-default login`) in your terminal, then retry this MCP tool.");
  }
  return error;
}

function entryPayload(entry = {}) {
  const candidates = [entry.data?.jsonPayload, entry.data, entry.jsonPayload, entry.metadata?.jsonPayload, entry.metadata];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    if (candidate.fields && typeof candidate.fields === "object") return structToPlainObject(candidate);
    if (candidate.eventName || candidate.clientTurnId || candidate.runId || candidate.outcome) return candidate;
  }
  return candidates.find((candidate) => candidate && typeof candidate === "object") || {};
}

function structToPlainObject(value) {
  if (!value || typeof value !== "object") return value;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.numberValue !== undefined) return value.numberValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.structValue) return structToPlainObject(value.structValue);
  if (value.listValue) return (value.listValue.values || []).map(structToPlainObject);
  if (value.fields) return Object.fromEntries(Object.entries(value.fields).map(([key, item]) => [key, structToPlainObject(item)]));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structToPlainObject(item)]));
}

export function buildLatencyLoggingFilter(params = {}) {
  if (params.query || params.logName || params.resource) throw new Error("unsupported arbitrary logging query");
  const window = params.startTime && params.endTime
    ? normalizeTimeWindow(params, new Date(params.endTime))
    : normalizeTimeWindow(params);
  const eventTypes = params.eventTypes || ["client", "server", "preflight"];
  const names = [...new Set(eventTypes.map((type) => EVENT_NAMES[type]))].filter(Boolean);
  if (!names.length || eventTypes.some((type) => !EVENT_NAMES[type])) throw new Error("eventTypes contains an unsupported value");
  const functionNames = [...new Set(eventTypes.map((type) => FUNCTION_NAMES[type]))];
  const clauses = [
    `resource.type = "cloud_function"`,
    `(${functionNames.map((name) => `resource.labels.function_name = ${quote(name)}`).join(" OR ")})`,
    `(${names.map((name) => `jsonPayload.eventName = ${quote(name)}`).join(" OR ")})`,
    `timestamp >= ${quote(window.startTime)}`,
    `timestamp <= ${quote(window.endTime)}`,
  ];
  for (const [field, values] of [["outcome", params.outcomes], ["clientTurnId", params.clientTurnIds], ["runId", params.runIds], ["dimensions.programId", params.programId && [params.programId]], ["dimensions.configKey", params.configKey && [params.configKey]], ["dimensions.model", params.model && [params.model]], ["dimensions.functionRegion", params.functionRegion && [params.functionRegion]], ["dimensions.coldInstance", params.coldInstance === undefined ? null : [params.coldInstance]]]) {
    const clause = namedFilter(field, values, field === "dimensions.coldInstance" ? "boolean" : "string");
    if (clause) clauses.push(clause);
  }
  return clauses.join(" AND ");
}

function safeObject(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (allowed !== null && !allowed.has(key)) continue;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const child = safeObject(nested, null);
      if (child && Object.keys(child).length) output[key] = child;
    } else if (["string", "number", "boolean"].includes(typeof nested)) {
      output[key] = nested;
    }
  }
  return output;
}

function safeTelemetryMap(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  for (const [key, record] of Object.entries(value)) {
    if (FLAT_MILESTONE_FIELDS.has(key)
      && ["string", "number", "boolean"].includes(typeof record)) {
      output[key] = record;
      continue;
    }
    const safeRecord = safeObject(record, allowed);
    if (safeRecord && Object.keys(safeRecord).length) output[key] = safeRecord;
  }
  return output;
}

function safeTelemetryAttempts(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((attempt) => safeObject(attempt, ATTEMPT_FIELDS))
    .filter((attempt) => attempt && Object.keys(attempt).length);
}

export function sanitizeLatencyEvent(entry = {}) {
  const metadata = entry.metadata || entry;
  const payload = entryPayload(entry);
  const result = {};
  for (const field of SAFE_ROOT_FIELDS) {
    if (payload[field] === undefined && entry[field] === undefined) continue;
    const value = payload[field] ?? entry[field];
    if (field === "stages") result[field] = safeTelemetryMap(value, STAGE_FIELDS);
    else if (field === "milestones") result[field] = safeTelemetryMap(value, MILESTONE_FIELDS);
    else if (field === "dimensions") result[field] = safeObject(value, SAFE_NESTED_FIELDS.dimensions);
    else if (["attemptRunIds"].includes(field) && Array.isArray(value)) result[field] = value.filter((item) => typeof item === "string");
    else if (field === "attempts") result[field] = safeTelemetryAttempts(value);
    else if (["string", "number", "boolean"].includes(typeof value)) result[field] = value;
  }
  if (metadata.insertId) result.eventId = metadata.insertId;
  if (!result.timestamp && metadata.timestamp) result.timestamp = new Date(metadata.timestamp).toISOString();
  return result;
}

function isPreflight(event) {
  return event.dimensions?.requestKind === "cors_preflight" || event.stages?.cors_preflight;
}

function eventCategory(event) {
  if (event.eventName === EVENT_NAMES.client) return "client";
  if (event.eventName === EVENT_NAMES.server) return isPreflight(event) ? "preflight" : "server";
  return null;
}

export function correlateLatencyEvents({ clientEvents = [], serverEvents = [], clientTurnId, runId } = {}) {
  const clients = [...new Map(clientEvents
    .filter((event) => event.clientTurnId)
    .filter((event) => !clientTurnId || event.clientTurnId === clientTurnId)
    .map((event) => [event.eventId || event.clientTurnId, event])).values()];
  const servers = serverEvents.filter((event) => !isPreflight(event));
  const serverByRun = new Map(servers.filter((event) => event.runId).map((event) => [event.runId, event]));
  const matches = [];
  const retries = [];
  for (const client of clients) {
    const final = client.finalRunId && serverByRun.get(client.finalRunId);
    if (final) matches.push({ client, server: final });
    for (const runId of client.attemptRunIds || []) {
      const retry = serverByRun.get(runId);
      if (retry && retry.runId !== client.finalRunId) retries.push({ client, server: retry });
    }
  }
  const matchedIds = new Set([...matches, ...retries].map(({ server }) => server.eventId || server.runId));
  const filteredMatches = runId
    ? matches.filter(({ server }) => server.runId === runId)
    : matches;
  const filteredRetries = runId
    ? retries.filter(({ server }) => server.runId === runId)
    : retries;
  const filteredMatchedIds = new Set([...filteredMatches, ...filteredRetries].map(({ server }) => server.eventId || server.runId));
  return {
    matches: filteredMatches,
    retries: filteredRetries,
    unmatchedServers: servers.filter((event) => !runId || event.runId === runId).filter((event) => !filteredMatchedIds.has(event.eventId || event.runId)),
  };
}

function requireCorrelationIdentifier(params) {
  const clientTurnId = typeof params.clientTurnId === "string" ? params.clientTurnId.trim() : "";
  const runId = typeof params.runId === "string" ? params.runId.trim() : "";
  if (!clientTurnId && !runId) throw new Error("clientTurnId or runId is required");
  return { clientTurnId: clientTurnId || undefined, runId: runId || undefined };
}

export function checkLatencyCoverage({ clientEvents = [], serverEvents = [] } = {}) {
  const clientIds = clientEvents.map((event) => event.eventId || event.clientTurnId).filter(Boolean);
  const uniqueClients = new Map(clientEvents.map((event) => [event.eventId || event.clientTurnId, event]));
  const postServers = serverEvents.filter((event) => !isPreflight(event));
  const uniqueRuns = new Map(postServers.filter((event) => event.runId).map((event) => [event.runId, event]));
  const clientRuns = new Set([...uniqueClients.values()].flatMap((event) => [event.finalRunId, ...(event.attemptRunIds || [])]).filter(Boolean));
  const duplicateClientEventIds = [...new Set(clientEvents
    .filter((event) => event.eventId)
    .filter((event, index, events) => events.findIndex((candidate) => candidate.eventId === event.eventId) !== index)
    .map((event) => event.eventId))];
  const duplicateServerRunIds = [...new Set(postServers
    .filter((event) => event.runId)
    .filter((event, index, events) => events.findIndex((candidate) => candidate.runId === event.runId) !== index)
    .map((event) => event.runId))];
  const clientsMissingServerAttempts = [...uniqueClients.values()]
    .filter((event) => event.attemptRunIds?.length && event.attemptRunIds.some((runId) => !uniqueRuns.has(runId)))
    .map((event) => event.clientTurnId)
    .filter(Boolean);
  const serversMissingClientReferences = [...uniqueRuns.values()]
    .filter((event) => !clientRuns.has(event.runId))
    .map((event) => event.runId);
  const clientsMissingTerminalOutcome = [...uniqueClients.values()]
    .filter((event) => !event.outcome || event.milestones?.terminalEvent == null)
    .map((event) => event.clientTurnId)
    .filter(Boolean);
  return {
    duplicateClientEvents: clientIds.length - uniqueClients.size,
    duplicateServerEvents: postServers.filter((event) => event.runId).length - uniqueRuns.size,
    missingRunId: postServers.filter((event) => !event.runId).length,
    orphanServers: [...uniqueRuns.values()].filter((event) => !clientRuns.has(event.runId)).length,
    corsPreflightEvents: serverEvents.filter(isPreflight).length,
    missingClientTurns: [...uniqueClients.values()].filter((event) => event.finalRunId && !uniqueRuns.has(event.finalRunId)).map((event) => event.clientTurnId),
    duplicateClientEventIds,
    duplicateServerRunIds,
    clientsMissingServerAttempts,
    serversMissingClientReferences,
    serverSummariesWithoutRunId: postServers.filter((event) => !event.runId).map((event) => event.eventId).filter(Boolean),
    clientsMissingTerminalOutcome,
    incompleteRetryChains: [...uniqueClients.values()]
      .filter((event) => {
        const attemptRunIds = event.attemptRunIds || [];
        const attempts = event.attempts || [];
        if (attempts.length !== attemptRunIds.length) return true;
        if (attempts.some((attempt, index) => attempt.runId !== attemptRunIds[index])) return true;
        return attempts.some((attempt, index) => Boolean(attempt.authRetry) !== (index > 0));
      })
      .map((event) => event.clientTurnId)
      .filter(Boolean),
  };
}

export function createCloudLoggingAdapter({ entries }) {
  if (typeof entries !== "function") throw new Error("Cloud Logging entries client is required");
  return {
    async exportRecomputeStatsLogs(params = {}, now = new Date()) {
      const window = params.startTime && params.endTime
        ? normalizeTimeWindow(params, new Date(params.endTime))
        : normalizeTimeWindow(params);
      const pageSize = Math.min(Math.max(Number(params.pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      let response;
      try {
        response = await entries(buildRecomputeStatsLoggingFilter({ ...params, ...window }), {
          pageSize,
          pageToken: params.pageToken,
        });
      } catch (error) {
        throw authRecoveryError(error);
      }
      const [rawEntries, nextQuery] = response;
      const logs = rawEntries
        .map(sanitizeRecomputeStatsLog)
        .map((log) => ({ ...log, category: classifyRecomputeStatsLog(log) }))
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      const counts = {};
      for (const log of logs) counts[log.category] = (counts[log.category] || 0) + 1;
      return {
        schemaVersion: 1,
        query: window,
        rawEntryCount: rawEntries.length,
        logs,
        counts,
        nextPageToken: nextQuery?.pageToken || undefined,
        truncated: Boolean(nextQuery?.pageToken),
      };
    },
    async exportChatLatencyEvents(params = {}, now = new Date()) {
      const window = normalizeTimeWindow(params, now);
      const pageSize = Math.min(Math.max(Number(params.pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      let response;
      try {
        response = await entries(buildLatencyLoggingFilter({ ...params, ...window }), {
          pageSize,
          pageToken: params.pageToken,
        });
      } catch (error) {
        throw authRecoveryError(error);
      }
      const [rawEntries, nextQuery] = response;
      const requestedTypes = new Set(params.eventTypes || ["client", "server", "preflight"]);
      const sorted = rawEntries
        .filter((entry) => {
          const payload = entryPayload(entry);
          return isTargetFunction(entry) && requestedTypes.has(eventCategory(payload));
        })
        .map(sanitizeLatencyEvent)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      const nextPageToken = nextQuery?.pageToken || undefined;
      const events = { client: [], server: [], preflight: [] };
      for (const event of sorted) {
        const category = eventCategory(event);
        if (category) events[category].push(event);
      }
      return { schemaVersion: 1, query: window, rawEntryCount: rawEntries.length, events, counts: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, value.length])), nextPageToken, truncated: Boolean(nextPageToken) };
    },
    async getChatLatencyCorrelation(params = {}, now = new Date()) {
      const identifiers = requireCorrelationIdentifier(params);
      const exported = await this.exportChatLatencyEvents({
        ...params,
        clientTurnIds: identifiers.clientTurnId ? [identifiers.clientTurnId] : undefined,
        // A run ID is stored on server events, while the client event stores
        // the related IDs in attemptRunIds/finalRunId. Use the exact server
        // filter for run-only lookups; when both identifiers are supplied,
        // keep the client-turn query so both sides remain available.
        runIds: identifiers.runId && !identifiers.clientTurnId ? [identifiers.runId] : undefined,
      }, now);
      const correlation = correlateLatencyEvents({
        clientEvents: exported.events.client,
        serverEvents: exported.events.server,
        ...identifiers,
      });
      const logicalClientTurn = exported.events.client.find((event) => !identifiers.clientTurnId || event.clientTurnId === identifiers.clientTurnId) || null;
      const matchingServerSummaries = exported.events.server
        .filter((event) => (identifiers.runId && event.runId === identifiers.runId)
          || (identifiers.clientTurnId && event.clientTurnId === identifiers.clientTurnId)
          || (logicalClientTurn && (logicalClientTurn.attemptRunIds || []).includes(event.runId)))
        .sort((a, b) => {
          const attemptRunIds = logicalClientTurn?.attemptRunIds || [];
          return attemptRunIds.indexOf(a.runId) - attemptRunIds.indexOf(b.runId);
        });
      if (identifiers.runId && logicalClientTurn && ![logicalClientTurn.finalRunId, ...(logicalClientTurn.attemptRunIds || [])].includes(identifiers.runId)) {
        return {
          ...exported,
          correlation: { matches: [], retries: [], unmatchedServers: [] },
          logicalClientTurn: null,
          attempts: [],
          matchingServerSummaries: [],
          terminalAttempt: null,
        };
      }
      const attemptRunIds = logicalClientTurn?.attemptRunIds || [];
      const resolvedAttemptRunIds = attemptRunIds.length
        ? attemptRunIds
        : matchingServerSummaries.map((event) => event.runId).filter(Boolean);
      return {
        ...exported,
        correlation,
        logicalClientTurn,
        attempts: resolvedAttemptRunIds,
        matchingServerSummaries,
        terminalAttempt: matchingServerSummaries.find((event) => event.runId === logicalClientTurn?.finalRunId)
          || (identifiers.runId && matchingServerSummaries.find((event) => event.runId === identifiers.runId))
          || matchingServerSummaries.at(-1)
          || null,
      };
    },
    async checkChatLatencyCoverage(params = {}, now = new Date()) {
      const exported = await this.exportChatLatencyEvents(params, now);
      return { ...exported, coverage: checkLatencyCoverage(exported.events) };
    },
    getChatLatencySchema() {
      return {
        schemaVersion: 1,
        eventTypes: Object.keys(EVENT_NAMES),
        eventNames: EVENT_NAMES,
        fields: {
          root: Object.fromEntries(SAFE_ROOT_FIELDS.map((field) => [field, field === "stages" || field === "milestones" || field === "dimensions" || field === "attempts" ? "object" : field === "attemptRunIds" ? "string[]" : "string|number|boolean"])),
          dimensions: Object.fromEntries(DIMENSION_FIELDS.map((field) => [field, "string|number|boolean|string[]"])),
          stageMeasurement: ["startOffsetMs", "endOffsetMs", "startedAt", "endedAt", "durationMs", ...DIMENSION_FIELDS],
          milestoneMeasurement: ["offsetMs", "send", "requestStarted", "tokenReady", "firstSseEvent", "firstTextToken", "firstVisibleToken", "terminalEvent", "responseHeaders", "uiSettled", "conversationRefreshCompleted", "pendingPersisted", "telemetryAttempted"],
          attempt: ["runId", "authRetry", "started", "tokenReady", "requestStarted", "responseHeaders", "terminalEvent", "outcome", "errorCategory"],
        },
        filters: {
          eventTypes: ["client", "server", "preflight"],
          outcomes: "string[]",
          clientTurnIds: "string[]",
          runIds: "string[]",
          programId: "string",
          configKey: "string",
          model: "string",
          functionRegion: "string",
          coldInstance: "boolean",
        },
        query: {
          defaultLookbackMinutes: DEFAULT_LOOKBACK_MINUTES,
          maxLookbackDays: 7,
          defaultPageSize: DEFAULT_PAGE_SIZE,
          maxPageSize: MAX_PAGE_SIZE,
          ordering: "Cloud Logging timestamp descending",
          pagination: "opaque pageToken/nextPageToken",
        },
        correlation: {
          identifiers: ["clientTurnId", "runId"],
          requirement: "at least one identifier; when both are supplied they must match the same correlation",
          retries: "attemptRunIds ordered from first attempt to finalRunId",
          terminalAttempt: "attempt matching finalRunId",
        },
        terminalSemantics: {
          client: "outcome plus milestones.terminalEvent",
          server: "outcome plus endedAt",
        },
        privacy: "No message, prompt, observation, tool, credential, or direct personal-identifying fields",
      };
    },
  };
}

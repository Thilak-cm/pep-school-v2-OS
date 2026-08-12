const PROJECT_ID = "pep-os";
const FUNCTION_NAMES = {
  client: "chatClientTelemetry",
  server: "childChatStream",
  preflight: "childChatStream",
};
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
  "dimensions", "attemptRunIds", "finalRunId",
];

const SAFE_NESTED_FIELDS = {
  stages: null,
  milestones: null,
  dimensions: new Set(DIMENSION_FIELDS),
};

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

function namedFilter(field, values) {
  if (!values?.length) return "";
  return `(${values.map((value) => `jsonPayload.${field} = ${quote(value)}`).join(" OR ")})`;
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
    const clause = namedFilter(field, values);
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

export function sanitizeLatencyEvent(entry = {}) {
  const metadata = entry.metadata || entry;
  const payload = entryPayload(entry);
  const result = {};
  for (const field of SAFE_ROOT_FIELDS) {
    if (payload[field] === undefined && entry[field] === undefined) continue;
    const value = payload[field] ?? entry[field];
    if (field === "stages" || field === "milestones") result[field] = safeObject(value, SAFE_NESTED_FIELDS[field]);
    else if (field === "dimensions") result[field] = safeObject(value, SAFE_NESTED_FIELDS.dimensions);
    else if (["attemptRunIds"].includes(field) && Array.isArray(value)) result[field] = value.filter((item) => typeof item === "string");
    else if (["string", "number", "boolean"].includes(typeof value)) result[field] = value;
  }
  if (metadata.insertId) result.eventId = metadata.insertId;
  if (!result.timestamp && metadata.timestamp) result.timestamp = new Date(metadata.timestamp).toISOString();
  return result;
}

function isPreflight(event) {
  return event.dimensions?.requestKind === "cors_preflight" || event.stages?.cors_preflight;
}

export function correlateLatencyEvents({ clientEvents = [], serverEvents = [] } = {}) {
  const clients = [...new Map(clientEvents.filter((event) => event.clientTurnId).map((event) => [event.eventId || event.clientTurnId, event])).values()];
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
  return { matches, retries, unmatchedServers: servers.filter((event) => !matchedIds.has(event.eventId || event.runId)) };
}

export function checkLatencyCoverage({ clientEvents = [], serverEvents = [] } = {}) {
  const clientIds = clientEvents.map((event) => event.eventId || event.clientTurnId).filter(Boolean);
  const uniqueClients = new Map(clientEvents.map((event) => [event.eventId || event.clientTurnId, event]));
  const postServers = serverEvents.filter((event) => !isPreflight(event));
  const uniqueRuns = new Map(postServers.filter((event) => event.runId).map((event) => [event.runId, event]));
  const clientRuns = new Set([...uniqueClients.values()].flatMap((event) => [event.finalRunId, ...(event.attemptRunIds || [])]).filter(Boolean));
  return {
    duplicateClientEvents: clientIds.length - uniqueClients.size,
    duplicateServerEvents: postServers.filter((event) => event.runId).length - uniqueRuns.size,
    missingRunId: postServers.filter((event) => !event.runId).length,
    orphanServers: [...uniqueRuns.values()].filter((event) => !clientRuns.has(event.runId)).length,
    corsPreflightEvents: serverEvents.filter(isPreflight).length,
    missingClientTurns: [...uniqueClients.values()].filter((event) => event.finalRunId && !uniqueRuns.has(event.finalRunId)).map((event) => event.clientTurnId),
  };
}

export function createCloudLoggingAdapter({ entries }) {
  if (typeof entries !== "function") throw new Error("Cloud Logging entries client is required");
  return {
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
      const names = new Set((params.eventTypes || ["client", "server", "preflight"]).map((type) => EVENT_NAMES[type]));
      const sorted = rawEntries
        .filter((entry) => {
          const payload = entryPayload(entry);
          return isTargetFunction(entry) && names.has(payload?.eventName);
        })
        .map(sanitizeLatencyEvent)
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      const nextPageToken = nextQuery?.pageToken || undefined;
      const events = { client: [], server: [], preflight: [] };
      for (const event of sorted) {
        if (event.eventName === "chat_client_latency") events.client.push(event);
        else if (isPreflight(event)) events.preflight.push(event);
        else if (event.eventName === "chat_server_latency") events.server.push(event);
      }
      return { schemaVersion: 1, query: window, rawEntryCount: rawEntries.length, events, counts: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, value.length])), nextPageToken, truncated: Boolean(nextPageToken) };
    },
    async getChatLatencyCorrelation(params = {}, now = new Date()) {
      const exported = await this.exportChatLatencyEvents(params, now);
      return { ...exported, correlation: correlateLatencyEvents({ clientEvents: exported.events.client, serverEvents: exported.events.server }) };
    },
    async checkChatLatencyCoverage(params = {}, now = new Date()) {
      const exported = await this.exportChatLatencyEvents(params, now);
      return { ...exported, coverage: checkLatencyCoverage(exported.events) };
    },
    getChatLatencySchema() {
      return { schemaVersion: 1, eventNames: EVENT_NAMES, rootFields: SAFE_ROOT_FIELDS, dimensionFields: DIMENSION_FIELDS, defaultLookbackMinutes: DEFAULT_LOOKBACK_MINUTES, maxLookbackDays: 7, defaultPageSize: DEFAULT_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE, privacy: "No message, prompt, observation, tool, credential, or direct personal-identifying fields" };
    },
  };
}

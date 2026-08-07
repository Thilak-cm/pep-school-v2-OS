import { performance } from "node:perf_hooks";

const SAFE_DIMENSION_KEYS = new Set([
  "model", "provider", "httpStatus", "errorCategory", "functionRegion",
  "coldInstance", "selectedToolCount", "toolSchemaChars", "modelIterationCount",
  "toolLayerCount", "toolCallCount", "toolNames", "promptMessageCount", "promptChars",
  "inputTokens", "outputTokens", "reasoningTokens", "cacheTokens",
  "historyFetched", "historyIncluded", "historyChars", "observationsFetched",
  "observationsIncluded", "observationsDiscarded", "observationChars",
  "observationTruncationReason", "cacheStatus", "cacheAgeMs", "requestBytes",
  "responseBytes", "clientDisconnected", "clientTurnIdPresent", "programId",
  "finishReason", "resultSizeBytes", "streamedChars", "iteration", "layer",
  "toolName", "count",
]);

function cleanValue(value) {
  if (typeof value === "string") return value.slice(0, 256);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value
    .filter((item) => typeof item === "string")
    .slice(0, 50)
    .map((item) => item.slice(0, 128));
  return undefined;
}

export function safeTelemetryDimensions(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!SAFE_DIMENSION_KEYS.has(key)) continue;
    const cleaned = cleanValue(value);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

function round(value) {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

export class ChatLatencyRecorder {
  constructor({ runId = null, clientTurnId = null, coldInstance = false, now = () => performance.now(), wallNow = () => Date.now() } = {}) {
    this.runId = runId;
    this.clientTurnId = clientTurnId;
    this.now = now;
    this.startedAt = now();
    this.startedWallMs = wallNow();
    this.wallNow = wallNow;
    this.stages = {};
    this.stageList = [];
    this.milestones = {};
    this.dimensions = { coldInstance: Boolean(coldInstance), clientTurnIdPresent: Boolean(clientTurnId) };
    this.outcome = "failed";
    this.trace = null;
    this.emitted = null;
    this.spanCount = 0;
  }

  startStage(name, initialMetadata = {}) {
    const start = this.now();
    let ended = false;
    return (endMetadata = {}) => {
      if (ended) return;
      ended = true;
      const end = this.now();
      const baseName = String(name || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
      let key = baseName;
      let suffix = 2;
      while (this.stages[key]) key = `${baseName}_${suffix++}`;
      const metadata = safeTelemetryDimensions({ ...initialMetadata, ...endMetadata });
      const stage = {
        name: key,
        startOffsetMs: round(start - this.startedAt),
        durationMs: round(end - start),
        metadata,
      };
      this.stages[key] = { durationMs: stage.durationMs, ...metadata };
      this.stageList.push(stage);
      if (this.trace) this.writeSpan(stage);
    };
  }

  async measure(name, operation, metadata = {}) {
    const end = this.startStage(name, metadata);
    try {
      return await operation();
    } finally {
      end();
    }
  }

  mark(name) {
    if (this.milestones[name]) return;
    this.milestones[name] = { offsetMs: round(this.now() - this.startedAt) };
  }

  setDimensions(values) {
    Object.assign(this.dimensions, safeTelemetryDimensions(values));
  }

  setCorrelation({ runId, clientTurnId } = {}) {
    if (runId) this.runId = String(runId).slice(0, 128);
    if (clientTurnId) this.clientTurnId = String(clientTurnId).slice(0, 128);
    this.dimensions.clientTurnIdPresent = Boolean(this.clientTurnId);
  }

  setOutcome(outcome, errorCategory = null) {
    this.outcome = outcome || "failed";
    if (errorCategory) this.dimensions.errorCategory = String(errorCategory).slice(0, 256);
  }

  attachTrace(trace) {
    if (!trace || typeof trace.span !== "function" || this.trace) return;
    this.trace = trace;
    this.stageList.forEach((stage) => this.writeSpan(stage));
  }

  writeSpan(stage) {
    const startTime = new Date(this.startedWallMs + stage.startOffsetMs);
    const endTime = new Date(startTime.getTime() + stage.durationMs);
    const span = this.trace?.span({
      name: `latency-${stage.name.replaceAll("_", "-")}`,
      startTime,
      metadata: stage.metadata,
    });
    span?.end?.({ endTime });
    this.spanCount += 1;
  }

  snapshot() {
    return {
      eventName: "chat_server_latency",
      schemaVersion: 1,
      runId: this.runId,
      clientTurnId: this.clientTurnId,
      startedAt: new Date(this.startedWallMs).toISOString(),
      totalDurationMs: round(this.now() - this.startedAt),
      stages: structuredClone(this.stages),
      milestones: structuredClone(this.milestones),
      dimensions: safeTelemetryDimensions(this.dimensions),
      outcome: this.outcome,
    };
  }

  summary() {
    if (this.emitted) return this.emitted;
    this.emitted = this.snapshot();
    return this.emitted;
  }

  emit(logger = console) {
    const alreadyEmitted = Boolean(this.emitted);
    const summary = this.summary();
    if (!alreadyEmitted) logger.info?.("[chat-latency] terminal server summary", summary);
    return summary;
  }
}

import { performance } from "node:perf_hooks";
import {
  validateOpaqueTelemetryId,
  validateTelemetryErrorCategory,
} from "../config/chatTelemetry.js";

const SAFE_DIMENSION_KEYS = new Set([
  "model", "provider", "httpStatus", "errorCategory", "functionRegion",
  "coldInstance", "selectedToolCount", "toolSchemaChars", "modelIterationCount",
  "toolLayerCount", "toolCallCount", "toolNames", "promptMessageCount", "promptChars",
  "inputTokens", "outputTokens", "reasoningTokens", "cacheTokens",
  "historyFetched", "historyIncluded", "historyChars", "observationsFetched",
  "observationsIncluded", "observationsDiscarded", "observationChars",
  "observationTruncationReason", "cacheStatus", "cacheAgeMs", "requestBytes",
  "providerResponseBytes", "sseResponseBytes", "clientDisconnected",
  "clientTurnIdPresent", "programId",
  "finishReason", "resultSizeBytes", "streamedChars", "iteration", "layer",
  "toolName", "count", "latencySpanFailureCount", "requestKind",
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

export function jsonUtf8ByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export class ChatLatencyRecorder {
  constructor({ runId = null, clientTurnId = null, coldInstance = false, now = () => performance.now(), wallNow = () => Date.now() } = {}) {
    this.runId = runId == null ? null : validateOpaqueTelemetryId(runId, "runId");
    this.clientTurnId = clientTurnId == null
      ? null
      : validateOpaqueTelemetryId(clientTurnId, "clientTurnId");
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
      const startOffsetMs = round(start - this.startedAt);
      const endOffsetMs = round(end - this.startedAt);
      const stage = {
        name: key,
        startOffsetMs,
        endOffsetMs,
        startedAt: new Date(this.startedWallMs + startOffsetMs).toISOString(),
        endedAt: new Date(this.startedWallMs + endOffsetMs).toISOString(),
        durationMs: round(end - start),
        metadata,
      };
      this.stages[key] = {
        startOffsetMs: stage.startOffsetMs,
        endOffsetMs: stage.endOffsetMs,
        startedAt: stage.startedAt,
        endedAt: stage.endedAt,
        durationMs: stage.durationMs,
        ...metadata,
      };
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

  mark(name, { repeat = false, ...metadata } = {}) {
    const baseName = String(name || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!repeat && this.milestones[baseName]) return;
    let key = baseName;
    let suffix = 2;
    while (this.milestones[key]) key = `${baseName}_${suffix++}`;
    this.milestones[key] = {
      offsetMs: round(this.now() - this.startedAt),
      ...safeTelemetryDimensions(metadata),
    };
  }

  setDimensions(values) {
    Object.assign(this.dimensions, safeTelemetryDimensions(values));
  }

  incrementDimensions(values) {
    const safeValues = safeTelemetryDimensions(values);
    for (const [key, value] of Object.entries(safeValues)) {
      if (typeof value !== "number") continue;
      this.dimensions[key] = (Number(this.dimensions[key]) || 0) + value;
    }
  }

  setCorrelation({ runId, clientTurnId } = {}) {
    if (runId) this.runId = validateOpaqueTelemetryId(runId, "runId");
    if (clientTurnId) {
      this.clientTurnId = validateOpaqueTelemetryId(clientTurnId, "clientTurnId");
    }
    this.dimensions.clientTurnIdPresent = Boolean(this.clientTurnId);
  }

  setOutcome(outcome, errorCategory = null) {
    this.outcome = outcome || "failed";
    delete this.dimensions.errorCategory;
    if (this.outcome === "completed") return;
    try {
      this.dimensions.errorCategory = validateTelemetryErrorCategory(errorCategory);
    } catch {
      this.dimensions.errorCategory = "chat/internal-error";
    }
  }

  attachTrace(trace) {
    if (!trace || typeof trace.span !== "function" || this.trace) return;
    this.trace = trace;
    this.stageList.forEach((stage) => this.writeSpan(stage));
  }

  writeSpan(stage) {
    const startTime = new Date(this.startedWallMs + stage.startOffsetMs);
    const endTime = new Date(startTime.getTime() + stage.durationMs);
    let span;
    try {
      span = this.trace?.span({
        name: `latency-${stage.name.replaceAll("_", "-")}`,
        startTime,
        metadata: stage.metadata,
      });
    } catch {
      this.noteSpanFailure();
      return;
    }
    if (typeof span?.end !== "function") {
      this.noteSpanFailure();
      return;
    }
    try {
      span.end({ endTime });
      this.spanCount += 1;
    } catch {
      this.noteSpanFailure();
    }
  }

  noteSpanFailure() {
    this.dimensions.latencySpanFailureCount =
      (this.dimensions.latencySpanFailureCount || 0) + 1;
  }

  snapshot() {
    const endedWallMs = this.wallNow();
    return {
      eventName: "chat_server_latency",
      schemaVersion: 1,
      runId: this.runId,
      clientTurnId: this.clientTurnId,
      startedAt: new Date(this.startedWallMs).toISOString(),
      endedAt: new Date(endedWallMs).toISOString(),
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

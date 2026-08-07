import packageJson from '../../package.json' with { type: 'json' };
import {
  CHAT_CLIENT_QUEUE_LIMIT,
  CHAT_CLIENT_QUEUE_MAX_AGE_MS,
  CHAT_TELEMETRY_SCHEMA_VERSION,
} from '../../../functions/config/chatTelemetry.js';

const QUEUE_KEY = 'pep.chatLatency.v1';
const APP_VERSION = packageJson.version;
const deliveriesInFlight = new Set();

function claimDelivery(eventId) {
  if (!eventId || deliveriesInFlight.has(eventId)) return false;
  deliveriesInFlight.add(eventId);
  return true;
}

function releaseDelivery(eventId) {
  deliveriesInFlight.delete(eventId);
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function browserDimensions(navigatorObject, documentObject) {
  const connection = navigatorObject?.connection;
  return {
    appVersion: APP_VERSION,
    visibilityAtSend: documentObject?.visibilityState || 'unknown',
    onlineAtSend: navigatorObject?.onLine ?? true,
    ...(connection?.effectiveType ? { networkEffectiveType: connection.effectiveType } : {}),
    ...(Number.isFinite(connection?.rtt) ? { networkRtt: connection.rtt } : {}),
    ...(Number.isFinite(connection?.downlink) ? { networkDownlink: connection.downlink } : {}),
    ...(typeof connection?.saveData === 'boolean' ? { networkSaveData: connection.saveData } : {}),
    requestAttemptCount: 0,
    authRetryCount: 0,
    sseEventCount: 0,
    responseBytes: 0,
    firstVisibleReached: false,
    durableQueueAvailable: true,
  };
}

export function readTelemetryQueue(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTelemetryQueue(storage, queue) {
  try {
    storage?.setItem?.(QUEUE_KEY, JSON.stringify(queue));
    return Boolean(storage?.setItem);
  } catch {
    return false;
  }
}

function pruneQueue(queue, now) {
  return queue
    .filter((record) => Number.isFinite(record?.createdAtMs) && now - record.createdAtMs <= CHAT_CLIENT_QUEUE_MAX_AGE_MS)
    .slice(-CHAT_CLIENT_QUEUE_LIMIT);
}

function upsertQueue(storage, record, wallNow) {
  const withoutCurrent = readTelemetryQueue(storage).filter((item) => item.eventId !== record.eventId);
  return writeTelemetryQueue(storage, pruneQueue([...withoutCurrent, record], wallNow()));
}

function removeFromQueue(storage, eventId, wallNow) {
  const next = pruneQueue(readTelemetryQueue(storage), wallNow()).filter((item) => item.eventId !== eventId);
  writeTelemetryQueue(storage, next);
}

export function normalizeTelemetryErrorCategory(errorCategory, outcome) {
  if (outcome === 'completed') return null;
  if (typeof errorCategory === 'string') {
    const normalized = errorCategory.trim();
    if (normalized && normalized.length <= 128) return normalized;
  }
  return 'client/unknown-error';
}

export class ChatTurnTelemetry {
  constructor({
    storage = globalThis.localStorage,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    wallNow = () => Date.now(),
    idFactory = defaultId,
    endpoint = '',
    getToken = async () => null,
    fetchImpl = globalThis.fetch,
    appVersion = APP_VERSION,
    programId = 'unknown',
    navigatorObject = globalThis.navigator,
    documentObject = globalThis.document,
  } = {}) {
    this.storage = storage;
    this.now = now;
    this.wallNow = wallNow;
    this.startedAt = now();
    this.endpoint = endpoint;
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.navigatorObject = navigatorObject;
    this.documentObject = documentObject;
    this.eventId = idFactory();
    this.clientTurnId = idFactory();
    this.finished = false;
    this.acknowledged = false;
    this.record = {
      schemaVersion: CHAT_TELEMETRY_SCHEMA_VERSION,
      eventId: this.eventId,
      clientTurnId: this.clientTurnId,
      attemptRunIds: [],
      attempts: [],
      finalRunId: null,
      milestones: { send: 0 },
      dimensions: { ...browserDimensions(navigatorObject, documentObject), appVersion, programId },
      outcome: 'interrupted',
      errorCategory: 'client/pending',
      createdAtMs: wallNow(),
    };
    const durable = this.persist();
    this.record.dimensions.durableQueueAvailable = durable;
    this.mark('pendingPersisted');
  }

  persist() {
    return upsertQueue(this.storage, this.record, this.wallNow);
  }

  mark(name) {
    if (["tokenReady", "requestStarted", "responseHeaders"].includes(name)) {
      const attempt = this.record.attempts.at(-1);
      if (attempt && !(name in attempt)) attempt[name] = Math.max(0, this.now() - this.startedAt);
    }
    if (!(name in this.record.milestones)) {
      this.record.milestones[name] = Math.max(0, this.now() - this.startedAt);
      this.persist();
    }
  }

  addRunId(runId, { authRetry = false } = {}) {
    if (runId && !this.record.attemptRunIds.includes(runId)) {
      this.record.attemptRunIds.push(runId);
      this.record.attempts.push({
        runId,
        authRetry,
        started: Math.max(0, this.now() - this.startedAt),
      });
    }
    this.record.finalRunId = runId || this.record.finalRunId;
    this.record.dimensions.requestAttemptCount = this.record.attemptRunIds.length;
    if (authRetry) this.record.dimensions.authRetryCount += 1;
    this.persist();
  }

  setDimension(name, value) {
    this.record.dimensions[name] = value;
    this.persist();
  }

  addResponseBytes(count) {
    // Byte and SSE callbacks run for every streamed chunk. Keep those counters
    // in memory and persist only at meaningful milestones to avoid making
    // localStorage latency part of the latency we are measuring.
    this.record.dimensions.responseBytes += Number(count) || 0;
  }

  recordSseEvent(event) {
    this.record.dimensions.sseEventCount += 1;
    this.mark('firstSseEvent');
    if (event?.event === 'token') this.mark('firstTextToken');
    if (event?.event === 'complete' || event?.event === 'error') this.mark('terminalEvent');
  }

  markFirstVisible() {
    this.record.dimensions.firstVisibleReached = true;
    this.mark('firstVisibleToken');
  }

  finish(outcome, errorCategory = null) {
    if (this.finished) return;
    this.finished = true;
    this.record.outcome = outcome;
    this.record.errorCategory = normalizeTelemetryErrorCategory(errorCategory, outcome);
    this.record.dimensions.visibilityAtTerminal = this.documentObject?.visibilityState || 'unknown';
    this.record.dimensions.onlineAtTerminal = this.navigatorObject?.onLine ?? true;
    this.mark('terminalEvent');
    this.persist();
  }

  async deliver() {
    if (this.acknowledged) return true;
    if (!this.endpoint || typeof this.fetchImpl !== 'function') return false;
    if (!claimDelivery(this.eventId)) return false;
    try {
      this.mark('telemetryAttempted');
      const token = await this.getToken();
      if (!token) return false;
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.record),
        keepalive: true,
      });
      if (!response.ok) return false;
      this.mark('telemetryAcknowledged');
      removeFromQueue(this.storage, this.eventId, this.wallNow);
      this.acknowledged = true;
      return true;
    } catch {
      return false;
    } finally {
      releaseDelivery(this.eventId);
    }
  }
}

export async function flushPendingChatTelemetry({
  storage = globalThis.localStorage,
  wallNow = () => Date.now(),
  endpoint,
  getToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const queue = pruneQueue(readTelemetryQueue(storage), wallNow());
  writeTelemetryQueue(storage, queue);
  if (!endpoint || typeof fetchImpl !== 'function') return 0;
  let delivered = 0;
  for (const stored of queue) {
    if (!claimDelivery(stored.eventId)) continue;
    try {
      const record = stored.errorCategory === 'client/pending'
        ? { ...stored, outcome: 'interrupted', errorCategory: 'client/session-ended' }
        : stored;
      const token = await getToken();
      if (!token) continue;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        keepalive: true,
      });
      if (response.ok) {
        removeFromQueue(storage, record.eventId, wallNow);
        delivered += 1;
      } else if (response.status === 400) {
        // A schema-invalid payload cannot become valid on retry. Remove only
        // that record so one poisoned event does not retry on every chat open.
        removeFromQueue(storage, record.eventId, wallNow);
      }
    } catch {
      // Telemetry is deliberately best-effort from the teacher's perspective;
      // the durable queue keeps the event for a later authenticated retry.
    } finally {
      releaseDelivery(stored.eventId);
    }
  }
  return delivered;
}

export function markAfterVisiblePaint(
  telemetry,
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
) {
  if (typeof requestFrame !== 'function') {
    telemetry?.markFirstVisible?.();
    return () => {};
  }
  let secondFrame = null;
  const firstFrame = requestFrame(() => {
    secondFrame = requestFrame(() => telemetry?.markFirstVisible?.());
  });
  return () => {
    cancelFrame?.(firstFrame);
    if (secondFrame != null) cancelFrame?.(secondFrame);
  };
}

export function scheduleAfterVisiblePaintOnce(
  schedule,
  telemetry,
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
) {
  if (!schedule || !telemetry || schedule.eventId === telemetry.eventId) return;
  schedule.cancel?.();
  schedule.eventId = telemetry.eventId;
  schedule.cancel = markAfterVisiblePaint(telemetry, requestFrame, cancelFrame);
}

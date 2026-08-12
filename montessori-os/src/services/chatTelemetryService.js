import packageJson from '../../package.json' with { type: 'json' };
import {
  CHAT_CLIENT_QUEUE_LIMIT,
  CHAT_CLIENT_QUEUE_MAX_AGE_MS,
  CHAT_TELEMETRY_SCHEMA_VERSION,
  validateTelemetryErrorCategory,
} from '../../../functions/config/chatTelemetry.js';

const QUEUE_KEY = 'pep.chatLatency.v1';
const APP_VERSION = packageJson.version;
const MAX_MILESTONE_OFFSET_MS = 86_400_000;
const deliveriesInFlight = new Set();
const liveTelemetryByEventId = new Map();
const PROGRAM_IDS = new Set(['toddler', 'primary', 'elementary', 'adolescent', 'unknown']);
const VISIBILITY_STATES = new Set(['visible', 'hidden', 'prerender', 'unknown']);
const NETWORK_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g', '4g']);

function normalizedEnum(value, allowed, fallback = 'unknown') {
  return allowed.has(value) ? value : fallback;
}

function claimDelivery(eventId) {
  if (!eventId || deliveriesInFlight.has(eventId)) return false;
  deliveriesInFlight.add(eventId);
  return true;
}

function releaseDelivery(eventId) {
  deliveriesInFlight.delete(eventId);
}

function defaultId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Correlation IDs are canonical UUIDs even in older test/webview runtimes
  // without crypto.randomUUID. They are identifiers, not authentication tokens.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function browserDimensions(navigatorObject, documentObject) {
  const connection = navigatorObject?.connection;
  return {
    appVersion: APP_VERSION,
    visibilityAtSend: normalizedEnum(documentObject?.visibilityState, VISIBILITY_STATES),
    onlineAtSend: navigatorObject?.onLine ?? true,
    ...(connection?.effectiveType
      ? { networkEffectiveType: normalizedEnum(connection.effectiveType, NETWORK_EFFECTIVE_TYPES) }
      : {}),
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

async function isAcceptedTelemetryResponse(response, eventId) {
  if (response?.status !== 202) return false;
  try {
    const payload = await response.json();
    return payload?.accepted === true && payload.eventId === eventId;
  } catch {
    return false;
  }
}

function finalizePendingRecord(stored) {
  if (stored.errorCategory !== 'client/pending') return stored;
  const offsets = [
    ...Object.values(stored.milestones || {}),
    ...(stored.attempts || []).flatMap((attempt) => [
      attempt.started,
      attempt.tokenReady,
      attempt.requestStarted,
      attempt.responseHeaders,
      attempt.terminalEvent,
    ]),
  ].filter(Number.isFinite);
  const terminalEvent = Math.max(0, ...offsets);
  const attempts = (stored.attempts || []).map((attempt) => attempt.outcome ? attempt : {
    ...attempt,
    terminalEvent,
    outcome: 'interrupted',
    errorCategory: 'client/session-ended',
  });
  return {
    ...stored,
    attempts,
    milestones: { ...stored.milestones, terminalEvent },
    outcome: 'interrupted',
    errorCategory: 'client/session-ended',
  };
}

function recordFlushAttempt(stored, wallNow) {
  const record = finalizePendingRecord(stored);
  if (record.milestones?.telemetryAttempted != null) return record;
  const elapsed = Number.isFinite(record.createdAtMs)
    ? Math.max(0, Math.min(MAX_MILESTONE_OFFSET_MS, wallNow() - record.createdAtMs))
    : 0;
  return {
    ...record,
    milestones: { ...record.milestones, telemetryAttempted: elapsed },
  };
}

export function normalizeTelemetryErrorCategory(errorCategory, outcome) {
  if (outcome === 'completed') return null;
  try {
    return validateTelemetryErrorCategory(errorCategory);
  } catch {
    // Fall through to a stable client category accepted by the server schema.
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
    this.firstVisibleExpected = false;
    this.firstVisibleWaitComplete = false;
    this.firstVisibleFallback = null;
    this.clearFirstVisibleFallback = null;
    this.firstVisibleWaiters = [];
    this.record = {
      schemaVersion: CHAT_TELEMETRY_SCHEMA_VERSION,
      eventId: this.eventId,
      clientTurnId: this.clientTurnId,
      attemptRunIds: [],
      attempts: [],
      finalRunId: null,
      milestones: { send: 0 },
      dimensions: {
        ...browserDimensions(navigatorObject, documentObject),
        appVersion,
        programId: normalizedEnum(programId, PROGRAM_IDS),
      },
      outcome: 'interrupted',
      errorCategory: 'client/pending',
      createdAtMs: wallNow(),
    };
    liveTelemetryByEventId.set(this.eventId, this);
    const durable = this.persist();
    this.record.dimensions.durableQueueAvailable = durable;
    if (durable) this.mark('pendingPersisted');
  }

  persist() {
    // Once the endpoint acknowledges this event it must never be placed back
    // into the durable queue by a late paint or cleanup callback.
    if (this.acknowledged) return true;
    return upsertQueue(this.storage, this.record, this.wallNow);
  }

  mark(name, { persist = true } = {}) {
    const elapsed = Math.max(0, this.now() - this.startedAt);
    if (["tokenReady", "requestStarted", "responseHeaders"].includes(name)) {
      const attempt = this.record.attempts.at(-1);
      if (attempt && !(name in attempt)) attempt[name] = elapsed;
    }
    if (!(name in this.record.milestones)) {
      this.record.milestones[name] = elapsed;
      if (persist) this.persist();
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
      if (authRetry) this.record.dimensions.authRetryCount += 1;
    }
    this.record.finalRunId = runId || this.record.finalRunId;
    this.record.dimensions.requestAttemptCount = this.record.attemptRunIds.length;
    this.persist();
  }

  finishAttempt(outcome, errorCategory = null) {
    const attempt = this.record.attempts.at(-1);
    if (!attempt || attempt.outcome) return;
    attempt.terminalEvent = Math.max(0, this.now() - this.startedAt);
    attempt.outcome = outcome === 'complete' ? 'completed' : outcome;
    attempt.errorCategory = normalizeTelemetryErrorCategory(errorCategory, attempt.outcome);
    this.persist();
  }

  markTerminalFromAttempt() {
    const terminalEvent = this.record.attempts.at(-1)?.terminalEvent;
    if (terminalEvent == null || this.record.milestones.terminalEvent != null) return;
    this.record.milestones.terminalEvent = terminalEvent;
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
    // Streaming callbacks run before token forwarding. Keep these milestones
    // in memory so synchronous localStorage writes cannot delay presentation.
    this.mark('firstSseEvent', { persist: false });
    if (event?.event === 'token') this.mark('firstTextToken', { persist: false });
    if (event?.event === 'complete') this.finishAttempt(event.data?.status || 'completed');
    if (event?.event === 'error') {
      this.finishAttempt(
        event.data?.status === 'interrupted' ? 'interrupted' : 'failed',
        event.data?.code || 'chat/server-error',
      );
    }
  }

  markFirstVisible() {
    if (this.record.dimensions.firstVisibleReached) return;
    this.record.dimensions.firstVisibleReached = true;
    this.mark('firstVisibleToken');
    this.releaseFirstVisibleWait();
  }

  releaseFirstVisibleWait() {
    if (this.firstVisibleFallback != null) {
      this.clearFirstVisibleFallback?.(this.firstVisibleFallback);
      this.firstVisibleFallback = null;
    }
    this.clearFirstVisibleFallback = null;
    this.firstVisibleWaitComplete = true;
    this.firstVisibleWaiters.splice(0).forEach((resolve) => resolve());
  }

  expectFirstVisible({
    fallbackMs = 1000,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout,
  } = {}) {
    if (this.record.dimensions.firstVisibleReached) return;
    this.firstVisibleExpected = true;
    if (this.documentObject?.visibilityState === 'hidden' || typeof setTimeoutFn !== 'function') {
      // Hidden documents and missing/stalled frame schedulers cannot prove a
      // paint. Release best-effort delivery without fabricating the primary
      // first-visible measurement.
      this.releaseFirstVisibleWait();
      return;
    }
    if (this.firstVisibleFallback == null) {
      this.clearFirstVisibleFallback = clearTimeoutFn;
      this.firstVisibleFallback = setTimeoutFn(() => {
        this.firstVisibleFallback = null;
        this.clearFirstVisibleFallback = null;
        this.releaseFirstVisibleWait();
      }, fallbackMs);
    }
  }

  waitForFirstVisible() {
    if (!this.firstVisibleExpected || this.record.dimensions.firstVisibleReached
      || this.firstVisibleWaitComplete) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.firstVisibleWaiters.push(resolve));
  }

  finish(outcome, errorCategory = null) {
    if (this.finished) return;
    this.finished = true;
    this.record.outcome = outcome;
    this.record.errorCategory = normalizeTelemetryErrorCategory(errorCategory, outcome);
    this.record.dimensions.visibilityAtTerminal = normalizedEnum(
      this.documentObject?.visibilityState,
      VISIBILITY_STATES,
    );
    this.record.dimensions.onlineAtTerminal = this.navigatorObject?.onLine ?? true;
    this.finishAttempt(outcome, this.record.errorCategory);
    this.mark('terminalEvent', { persist: false });
    this.persist();
  }

  async deliver() {
    if (this.acknowledged) return true;
    if (!this.endpoint || typeof this.fetchImpl !== 'function') return false;
    if (!claimDelivery(this.eventId)) return false;
    try {
      await this.waitForFirstVisible();
      this.mark('telemetryAttempted');
      const token = await this.getToken();
      if (!token) return false;
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.record),
        keepalive: true,
      });
      if (!await isAcceptedTelemetryResponse(response, this.eventId)) return false;
      this.acknowledged = true;
      if (liveTelemetryByEventId.get(this.eventId) === this) {
        liveTelemetryByEventId.delete(this.eventId);
      }
      this.mark('telemetryAcknowledged');
      removeFromQueue(this.storage, this.eventId, this.wallNow);
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
    const liveTelemetry = liveTelemetryByEventId.get(stored.eventId);
    if (liveTelemetry) {
      // A queued client/pending record can belong to a turn that is still
      // streaming in this page. Only records without a live owner are orphaned
      // sessions; finished live turns retain their terminal state and use the
      // instance delivery path so later milestones cannot be overwritten.
      if (liveTelemetry.finished && await liveTelemetry.deliver()) delivered += 1;
      continue;
    }
    if (!claimDelivery(stored.eventId)) continue;
    try {
      const record = recordFlushAttempt(stored, wallNow);
      // Persist before auth/fetch so an offline or signed-out flush still
      // records that delivery was attempted without losing the event.
      upsertQueue(storage, record, wallNow);
      const token = await getToken();
      if (!token) continue;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        keepalive: true,
      });
      if (await isAcceptedTelemetryResponse(response, record.eventId)) {
        removeFromQueue(storage, record.eventId, wallNow);
        delivered += 1;
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
  telemetry?.expectFirstVisible?.();
  if (telemetry?.documentObject?.visibilityState === 'hidden') {
    return () => {};
  }
  if (typeof requestFrame !== 'function') {
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

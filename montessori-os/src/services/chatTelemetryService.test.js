import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ChatTurnTelemetry,
  flushPendingChatTelemetry,
  markAfterVisiblePaint,
  normalizeTelemetryErrorCategory,
  readTelemetryQueue,
  scheduleAfterVisiblePaintOnce,
} from './chatTelemetryService.js';
import { validateClientTelemetryPayload } from '../../../functions/config/chatTelemetry.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('ChatTurnTelemetry persists before network work and correlates auth retry run IDs', () => {
  const storage = memoryStorage();
  let now = 100;
  const telemetry = new ChatTurnTelemetry({
    storage,
    now: () => now,
    wallNow: () => 1_700_000_000_000,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
    appVersion: '12.3.0',
    programId: 'primary',
  });

  assert.equal(readTelemetryQueue(storage).length, 1);
  assert.equal(telemetry.clientTurnId, 'client-1');
  telemetry.addRunId('run-1');
  now = 120;
  telemetry.mark('tokenReady');
  telemetry.addRunId('run-2', { authRetry: true });
  telemetry.finish('completed');

  const [record] = readTelemetryQueue(storage);
  assert.deepEqual(record.attemptRunIds, ['run-1', 'run-2']);
  assert.deepEqual(record.attempts, [
    { runId: 'run-1', authRetry: false, started: 0, tokenReady: 20 },
    { runId: 'run-2', authRetry: true, started: 20 },
  ]);
  assert.equal(record.finalRunId, 'run-2');
  assert.equal(record.dimensions.authRetryCount, 1);
  assert.equal(record.milestones.tokenReady, 20);
  assert.equal(record.errorCategory, null);
  assert.doesNotThrow(() => validateClientTelemetryPayload(record));
});

test('high-frequency byte and token counters stay in memory until a milestone persists them', () => {
  let writes = 0;
  let stored = null;
  const storage = {
    getItem: () => stored,
    setItem: (_key, value) => { writes += 1; stored = value; },
  };
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
  });
  const initialWrites = writes;
  telemetry.addResponseBytes(10);
  telemetry.addResponseBytes(20);
  telemetry.recordSseEvent({ event: 'token' });
  const afterFirstToken = writes;
  telemetry.recordSseEvent({ event: 'token' });
  telemetry.recordSseEvent({ event: 'token' });

  assert.equal(afterFirstToken > initialWrites, true);
  assert.equal(writes, afterFirstToken);
  telemetry.finish('completed');
  const [record] = readTelemetryQueue(storage);
  assert.equal(record.dimensions.responseBytes, 30);
  assert.equal(record.dimensions.sseEventCount, 3);
});

test('numeric DOMException codes are normalized before telemetry is persisted', () => {
  const storage = memoryStorage();
  const abortError = new DOMException('The operation was aborted', 'AbortError');
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
  });

  assert.equal(abortError.code, 20);
  telemetry.finish('aborted', abortError.code);

  const [record] = readTelemetryQueue(storage);
  assert.equal(normalizeTelemetryErrorCategory(abortError.code, 'aborted'), 'client/unknown-error');
  assert.equal(record.errorCategory, 'client/unknown-error');
  assert.doesNotThrow(() => validateClientTelemetryPayload(record));
});

test('visible-token timing waits for two animation frames after commit', () => {
  const callbacks = [];
  let visible = 0;
  markAfterVisiblePaint({ markFirstVisible: () => { visible += 1; } }, (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  assert.equal(visible, 0);
  callbacks.shift()();
  assert.equal(visible, 0);
  callbacks.shift()();
  assert.equal(visible, 1);
});

test('visible-token scheduling survives repeated streamed message renders', () => {
  const callbacks = [];
  const schedule = {};
  let visible = 0;
  const telemetry = { eventId: 'event-1', markFirstVisible: () => { visible += 1; } };
  const requestFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };

  scheduleAfterVisiblePaintOnce(schedule, telemetry, requestFrame, () => {});
  scheduleAfterVisiblePaintOnce(schedule, telemetry, requestFrame, () => {});

  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  callbacks.shift()();
  assert.equal(visible, 1);
});

test('successful telemetry delivery acknowledges and removes the queued event', async () => {
  const storage = memoryStorage();
  const requests = [];
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 202 }; },
  });
  telemetry.addRunId('run-1');
  telemetry.finish('completed');

  await telemetry.deliver();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.keepalive, true);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer firebase-token');
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('direct delivery and queue flush do not send the same event concurrently', async () => {
  const storage = memoryStorage();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return { ok: true, status: 202 };
  };
  const telemetry = new ChatTurnTelemetry({
    storage,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
  });
  telemetry.finish('completed');

  await Promise.all([
    telemetry.deliver(),
    flushPendingChatTelemetry({
      storage,
      endpoint: 'https://example.test/telemetry',
      getToken: async () => 'firebase-token',
      fetchImpl,
    }),
  ]);

  assert.equal(requests, 1);
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('queue is bounded, expires old entries, and retries pending events', async () => {
  const storage = memoryStorage();
  const base = 1_700_000_000_000;
  storage.setItem('pep.chatLatency.v1', JSON.stringify([
    { eventId: 'expired', createdAtMs: base - 8 * 24 * 60 * 60 * 1000 },
    ...Array.from({ length: 105 }, (_, index) => ({
      schemaVersion: 1,
      eventId: `event-${index}`,
      clientTurnId: `client-${index}`,
      attemptRunIds: [], attempts: [], finalRunId: null, milestones: { send: 0 }, dimensions: {},
      outcome: 'interrupted', errorCategory: 'client/session-ended', createdAtMs: base,
    })),
  ]));
  let deliveries = 0;
  await flushPendingChatTelemetry({
    storage,
    wallNow: () => base,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'token',
    fetchImpl: async () => { deliveries += 1; return { ok: true }; },
  });

  assert.equal(deliveries, 100);
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('flush drops HTTP 400 records but retains transient failures', async () => {
  const storage = memoryStorage();
  const base = 1_700_000_000_000;
  storage.setItem('pep.chatLatency.v1', JSON.stringify([
    { eventId: 'invalid', createdAtMs: base, errorCategory: 20 },
    { eventId: 'transient', createdAtMs: base, errorCategory: 'chat/network' },
  ]));

  const delivered = await flushPendingChatTelemetry({
    storage,
    wallNow: () => base,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'token',
    fetchImpl: async (_url, init) => {
      const record = JSON.parse(init.body);
      return record.eventId === 'invalid'
        ? { ok: false, status: 400 }
        : { ok: false, status: 503 };
    },
  });

  assert.equal(delivered, 0);
  assert.deepEqual(readTelemetryQueue(storage).map((record) => record.eventId), ['transient']);
});

test('storage and delivery failures never throw into the chat flow', async () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: (() => { const ids = ['event-1', 'client-1']; return () => ids.shift(); })(),
    getToken: async () => { throw new Error('offline'); },
  });
  telemetry.finish('failed', 'chat/network');
  assert.equal(await telemetry.deliver(), false);
});

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

const EVENT_ID = '00000000-0000-4000-8000-000000000001';
const CLIENT_TURN_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID_1 = '00000000-0000-4000-8000-000000000003';
const RUN_ID_2 = '00000000-0000-4000-8000-000000000004';

function canonicalIdFactory() {
  const ids = [EVENT_ID, CLIENT_TURN_ID];
  return () => ids.shift();
}

function acceptedResponse(eventId = EVENT_ID) {
  return { status: 202, json: async () => ({ accepted: true, eventId }) };
}

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
    idFactory: canonicalIdFactory(),
    appVersion: '12.3.0',
    programId: 'primary',
  });

  assert.equal(readTelemetryQueue(storage).length, 1);
  assert.equal(telemetry.clientTurnId, CLIENT_TURN_ID);
  telemetry.addRunId(RUN_ID_1);
  now = 120;
  telemetry.mark('tokenReady');
  telemetry.finishAttempt('failed', 'auth/unauthenticated');
  telemetry.addRunId(RUN_ID_2, { authRetry: true });
  telemetry.finish('completed');

  const [record] = readTelemetryQueue(storage);
  assert.deepEqual(record.attemptRunIds, [RUN_ID_1, RUN_ID_2]);
  assert.deepEqual(record.attempts, [
    {
      runId: RUN_ID_1, authRetry: false, started: 0, tokenReady: 20,
      terminalEvent: 20, outcome: 'failed', errorCategory: 'auth/unauthenticated',
    },
    {
      runId: RUN_ID_2, authRetry: true, started: 20,
      terminalEvent: 20, outcome: 'completed', errorCategory: null,
    },
  ]);
  assert.equal(record.finalRunId, RUN_ID_2);
  assert.equal(record.dimensions.authRetryCount, 1);
  assert.equal(record.milestones.tokenReady, 20);
  assert.equal(record.errorCategory, null);
  assert.doesNotThrow(() => validateClientTelemetryPayload(record));
});

test('pendingPersisted is recorded only after localStorage accepts the queue write', () => {
  const telemetry = new ChatTurnTelemetry({
    storage: { getItem: () => null, setItem: () => { throw new Error('blocked'); } },
    idFactory: canonicalIdFactory(),
  });

  assert.equal(telemetry.record.dimensions.durableQueueAvailable, false);
  assert.equal('pendingPersisted' in telemetry.record.milestones, false);
});

test('token forwarding counters and milestones stay in memory until terminal persistence', () => {
  let writes = 0;
  let stored = null;
  const storage = {
    getItem: () => stored,
    setItem: (_key, value) => { writes += 1; stored = value; },
  };
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: canonicalIdFactory(),
  });
  const initialWrites = writes;
  telemetry.addResponseBytes(10);
  telemetry.addResponseBytes(20);
  telemetry.recordSseEvent({ event: 'token' });
  const afterFirstToken = writes;
  telemetry.recordSseEvent({ event: 'token' });
  telemetry.recordSseEvent({ event: 'token' });

  assert.equal(afterFirstToken, initialWrites);
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
    idFactory: canonicalIdFactory(),
  });

  assert.equal(abortError.code, 20);
  telemetry.finish('aborted', abortError.code);

  const [record] = readTelemetryQueue(storage);
  assert.equal(normalizeTelemetryErrorCategory(abortError.code, 'aborted'), 'client/unknown-error');
  assert.equal(record.errorCategory, 'client/unknown-error');
  assert.doesNotThrow(() => validateClientTelemetryPayload(record));
});

test('client error categories use the same stable schema as the server', () => {
  assert.equal(normalizeTelemetryErrorCategory('auth/unauthenticated', 'failed'), 'auth/unauthenticated');
  assert.equal(normalizeTelemetryErrorCategory('Permission Denied', 'failed'), 'client/unknown-error');
  assert.equal(normalizeTelemetryErrorCategory('chat/internal_error', 'failed'), 'client/unknown-error');
});

test('auth retry retains each attempt terminal while logical terminal remains final', () => {
  const storage = memoryStorage();
  let now = 100;
  const telemetry = new ChatTurnTelemetry({
    storage,
    now: () => now,
    idFactory: canonicalIdFactory(),
  });

  telemetry.addRunId(RUN_ID_1);
  now = 120;
  telemetry.recordSseEvent({
    event: 'error',
    data: { code: 'auth/unauthenticated', status: 'failed' },
  });
  assert.equal('terminalEvent' in telemetry.record.milestones, false);
  telemetry.addRunId(RUN_ID_2, { authRetry: true });
  now = 160;
  telemetry.recordSseEvent({ event: 'complete', data: { status: 'complete' } });
  assert.equal('terminalEvent' in telemetry.record.milestones, false);
  telemetry.markTerminalFromAttempt();
  now = 180;
  telemetry.finish('completed');

  assert.deepEqual(telemetry.record.attempts.map((attempt) => ({
    runId: attempt.runId,
    terminalEvent: attempt.terminalEvent,
    outcome: attempt.outcome,
    errorCategory: attempt.errorCategory,
  })), [
    {
      runId: RUN_ID_1, terminalEvent: 20, outcome: 'failed',
      errorCategory: 'auth/unauthenticated',
    },
    { runId: RUN_ID_2, terminalEvent: 60, outcome: 'completed', errorCategory: null },
  ]);
  assert.equal(telemetry.record.milestones.terminalEvent, 60);
  assert.doesNotThrow(() => validateClientTelemetryPayload(telemetry.record));
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
    idFactory: canonicalIdFactory(),
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl: async (url, init) => { requests.push({ url, init }); return acceptedResponse(); },
  });
  telemetry.addRunId(RUN_ID_1);
  telemetry.finish('completed');

  await telemetry.deliver();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.keepalive, true);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer firebase-token');
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('delivery waits for the two-frame visible marker and sends it in the acknowledged payload', async () => {
  const storage = memoryStorage();
  const callbacks = [];
  const requests = [];
  const telemetry = new ChatTurnTelemetry({
    storage,
    documentObject: { visibilityState: 'visible' },
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return acceptedResponse();
    },
    idFactory: canonicalIdFactory(),
  });
  telemetry.addRunId(RUN_ID_1);
  telemetry.finish('completed');
  markAfterVisiblePaint(telemetry, (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });

  const delivery = telemetry.deliver();
  await Promise.resolve();
  assert.equal(requests.length, 0);
  callbacks.shift()();
  await Promise.resolve();
  assert.equal(requests.length, 0);
  callbacks.shift()();
  assert.equal(await delivery, true);
  assert.equal(requests[0].dimensions.firstVisibleReached, true);
  assert.equal(Number.isFinite(requests[0].milestones.firstVisibleToken), true);
});

test('hidden tabs and stalled paints bound delivery without fabricating first-visible', async () => {
  for (const hidden of [true, false]) {
    const storage = memoryStorage();
    let fallback;
    const requests = [];
    const telemetry = new ChatTurnTelemetry({
      storage,
      documentObject: { visibilityState: hidden ? 'hidden' : 'visible' },
      endpoint: 'https://example.test/telemetry',
      getToken: async () => 'firebase-token',
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return acceptedResponse();
      },
      idFactory: canonicalIdFactory(),
    });
    telemetry.addRunId(hidden ? RUN_ID_1 : RUN_ID_2);
    telemetry.finish('completed');
    telemetry.expectFirstVisible({
      fallbackMs: 25,
      setTimeoutFn: (callback) => { fallback = callback; return 1; },
    });

    const delivery = telemetry.deliver();
    await Promise.resolve();
    if (!hidden) {
      assert.equal(requests.length, 0);
      fallback();
    }
    assert.equal(await delivery, true);
    assert.equal(requests[0].dimensions.firstVisibleReached, false);
    assert.equal('firstVisibleToken' in requests[0].milestones, false);
    assert.doesNotThrow(() => validateClientTelemetryPayload(requests[0]));
  }
});

test('missing animation-frame support never fabricates first-visible', async () => {
  const telemetry = new ChatTurnTelemetry({
    storage: memoryStorage(),
    documentObject: { visibilityState: 'visible' },
    idFactory: canonicalIdFactory(),
  });
  markAfterVisiblePaint(telemetry, undefined);
  telemetry.releaseFirstVisibleWait();

  assert.equal(telemetry.record.dimensions.firstVisibleReached, false);
  assert.equal('firstVisibleToken' in telemetry.record.milestones, false);
});

test('late milestones cannot requeue an acknowledged telemetry event', async () => {
  const storage = memoryStorage();
  const telemetry = new ChatTurnTelemetry({
    storage,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl: async () => acceptedResponse(),
    idFactory: canonicalIdFactory(),
  });
  telemetry.addRunId(RUN_ID_1);
  telemetry.finish('completed');

  assert.equal(await telemetry.deliver(), true);
  telemetry.markFirstVisible();
  telemetry.mark('conversationRefreshCompleted');
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('direct delivery and queue flush do not send the same event concurrently', async () => {
  const storage = memoryStorage();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return acceptedResponse();
  };
  const telemetry = new ChatTurnTelemetry({
    storage,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl,
    idFactory: canonicalIdFactory(),
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

test('online flush leaves a live pending turn for completed terminal delivery', async () => {
  const storage = memoryStorage();
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const record = JSON.parse(init.body);
    requests.push(record);
    return acceptedResponse(record.eventId);
  };
  const telemetry = new ChatTurnTelemetry({
    storage,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl,
    idFactory: canonicalIdFactory(),
  });
  telemetry.addRunId(RUN_ID_1);

  const flush = flushPendingChatTelemetry({
    storage,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'firebase-token',
    fetchImpl,
  });
  telemetry.finish('completed');

  assert.equal(await flush, 0);
  assert.equal(await telemetry.deliver(), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].outcome, 'completed');
  assert.equal(requests[0].errorCategory, null);
  assert.equal(requests[0].attempts[0].outcome, 'completed');
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
    fetchImpl: async (_url, init) => {
      deliveries += 1;
      return acceptedResponse(JSON.parse(init.body).eventId);
    },
  });

  assert.equal(deliveries, 100);
  assert.equal(readTelemetryQueue(storage).length, 0);
});

test('flush finalizes a pending attempt as an interrupted terminal record', async () => {
  const storage = memoryStorage();
  const base = 1_700_000_000_000;
  storage.setItem('pep.chatLatency.v1', JSON.stringify([{
    schemaVersion: 1,
    eventId: EVENT_ID,
    clientTurnId: CLIENT_TURN_ID,
    attemptRunIds: [RUN_ID_1],
    attempts: [{ runId: RUN_ID_1, authRetry: false, started: 0, requestStarted: 20 }],
    finalRunId: RUN_ID_1,
    milestones: { send: 0, requestStarted: 20 },
    dimensions: {
      appVersion: '12.2.3', programId: 'primary', visibilityAtSend: 'visible',
      onlineAtSend: true, requestAttemptCount: 1, authRetryCount: 0,
      sseEventCount: 0, responseBytes: 0, firstVisibleReached: false,
      durableQueueAvailable: true,
    },
    outcome: 'interrupted',
    errorCategory: 'client/pending',
    createdAtMs: base,
  }]));
  let deliveredRecord;

  await flushPendingChatTelemetry({
    storage,
    wallNow: () => base,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'token',
    fetchImpl: async (_url, init) => {
      deliveredRecord = JSON.parse(init.body);
      return acceptedResponse(deliveredRecord.eventId);
    },
  });

  assert.equal(deliveredRecord.outcome, 'interrupted');
  assert.equal(deliveredRecord.attempts[0].outcome, 'interrupted');
  assert.equal(deliveredRecord.attempts[0].errorCategory, 'client/session-ended');
  assert.equal(Number.isFinite(deliveredRecord.milestones.telemetryAttempted), true);
  assert.doesNotThrow(() => validateClientTelemetryPayload(deliveredRecord));
});

test('an unauthenticated flush safely persists telemetryAttempted for a later retry', async () => {
  const storage = memoryStorage();
  const base = 1_700_000_000_000;
  storage.setItem('pep.chatLatency.v1', JSON.stringify([{
    schemaVersion: 1,
    eventId: EVENT_ID,
    clientTurnId: CLIENT_TURN_ID,
    attemptRunIds: [],
    attempts: [],
    finalRunId: null,
    milestones: { send: 0 },
    dimensions: {
      appVersion: '12.2.3', programId: 'primary', visibilityAtSend: 'visible',
      onlineAtSend: true, requestAttemptCount: 0, authRetryCount: 0,
      sseEventCount: 0, responseBytes: 0, firstVisibleReached: false,
      durableQueueAvailable: true,
      visibilityAtTerminal: 'visible', onlineAtTerminal: true,
    },
    outcome: 'failed',
    errorCategory: 'auth/unauthenticated',
    createdAtMs: base,
  }]));

  assert.equal(await flushPendingChatTelemetry({
    storage,
    wallNow: () => base + 500,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => null,
    fetchImpl: async () => assert.fail('no token must not fetch'),
  }), 0);

  const [stored] = readTelemetryQueue(storage);
  assert.equal(stored.milestones.telemetryAttempted, 500);
  assert.doesNotThrow(() => validateClientTelemetryPayload(stored));
});

test('flush retains all responses without an exact acceptance acknowledgement', async () => {
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
  assert.deepEqual(readTelemetryQueue(storage).map((record) => record.eventId), ['invalid', 'transient']);
});

test('direct delivery retains malformed and mismatched 2xx acknowledgements', async () => {
  const responses = [
    { status: 200, json: async () => ({ accepted: true, eventId: EVENT_ID }) },
    { status: 202, json: async () => { throw new SyntaxError('invalid json'); } },
    { status: 202, json: async () => ({ accepted: false, eventId: EVENT_ID }) },
    { status: 202, json: async () => ({ accepted: true, eventId: CLIENT_TURN_ID }) },
  ];

  for (const response of responses) {
    const storage = memoryStorage();
    const telemetry = new ChatTurnTelemetry({
      storage,
      idFactory: canonicalIdFactory(),
      endpoint: 'https://example.test/telemetry',
      getToken: async () => 'firebase-token',
      fetchImpl: async () => response,
    });
    telemetry.finish('completed');

    assert.equal(await telemetry.deliver(), false);
    assert.equal(readTelemetryQueue(storage).length, 1);
  }
});

test('queue flush removes only the record named by an exact 202 acknowledgement', async () => {
  const storage = memoryStorage();
  const base = 1_700_000_000_000;
  storage.setItem('pep.chatLatency.v1', JSON.stringify([
    { eventId: 'malformed', createdAtMs: base },
    { eventId: 'mismatched', createdAtMs: base },
    { eventId: 'accepted', createdAtMs: base },
  ]));

  const delivered = await flushPendingChatTelemetry({
    storage,
    wallNow: () => base,
    endpoint: 'https://example.test/telemetry',
    getToken: async () => 'token',
    fetchImpl: async (_url, init) => {
      const { eventId } = JSON.parse(init.body);
      if (eventId === 'malformed') {
        return { status: 202, json: async () => { throw new SyntaxError('invalid json'); } };
      }
      if (eventId === 'mismatched') return acceptedResponse('another-event');
      return acceptedResponse(eventId);
    },
  });

  assert.equal(delivered, 1);
  assert.deepEqual(readTelemetryQueue(storage).map((record) => record.eventId), [
    'malformed',
    'mismatched',
  ]);
});

test('storage and delivery failures never throw into the chat flow', async () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const telemetry = new ChatTurnTelemetry({
    storage,
    idFactory: canonicalIdFactory(),
    getToken: async () => { throw new Error('offline'); },
  });
  telemetry.finish('failed', 'chat/network');
  assert.equal(await telemetry.deliver(), false);
});

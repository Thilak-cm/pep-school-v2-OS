import test from 'node:test';
import assert from 'node:assert/strict';

import { ChatStreamError, createChatIds, createChatTurnPayload, parseSseEvents, streamChatTurn } from './chatStreamService.js';

test('createChatIds returns stable identifiers for a turn', () => {
  const ids = createChatIds(() => 'id-1');
  assert.deepEqual(ids, {
    chatId: 'id-1',
    turnId: 'id-1',
    runId: 'id-1',
    userMessageId: 'id-1',
  });
});

test('createChatTurnPayload keeps selected chat id over generated chat id', () => {
  const payload = createChatTurnPayload({
    studentId: 'student-1',
    chatId: 'selected-chat',
    ids: {
      chatId: 'fresh-chat',
      turnId: 'turn-1',
      runId: 'run-1',
      userMessageId: 'message-1',
    },
    message: 'hello',
    clientTurnId: 'client-turn-1',
  });

  assert.equal(payload.chatId, 'selected-chat');
  assert.equal(payload.turnId, 'turn-1');
  assert.equal(payload.runId, 'run-1');
  assert.equal(payload.userMessageId, 'message-1');
  assert.equal(payload.clientTurnId, 'client-turn-1');
});

test('streamChatTurn reports request, response, byte, and error-event telemetry before throwing', async () => {
  const marks = [];
  const events = [];
  const encoder = new TextEncoder();
  let read = 0;
  const telemetry = {
    mark: (name) => marks.push(name),
    addResponseBytes: (count) => marks.push(`bytes:${count}`),
    recordSseEvent: (event) => events.push(event.event),
  };

  await assert.rejects(() => streamChatTurn({
    url: 'https://example.test/chat', token: 'token', payload: { message: 'hello' }, telemetry,
    fetchImpl: async () => ({
      ok: true,
      body: { getReader: () => ({
        read: async () => read++ === 0
          ? { done: false, value: encoder.encode('event: error\ndata: {"code":"chat/test","error":"Failed"}\n\n') }
          : { done: true },
        releaseLock: () => {},
      }) },
    }),
  }), (error) => error.code === 'chat/test');

  assert.deepEqual(marks.slice(0, 2), ['requestStarted', 'responseHeaders']);
  assert.equal(marks.some((value) => String(value).startsWith('bytes:')), true);
  assert.deepEqual(events, ['error']);
});

test('parseSseEvents handles complete and partial event blocks', () => {
  const first = parseSseEvents('event: token\ndata: {"text":"Hi"}\n\nevent: token\ndata: {"text":"t', '');
  assert.deepEqual(first.events, [{ event: 'token', data: '{"text":"Hi"}' }]);
  assert.equal(first.remainder, 'event: token\ndata: {"text":"t');
});

test('streamChatTurn sends auth and forwards token events', async () => {
  const received = [];
  const encoder = new TextEncoder();
  let read = 0;
  const response = {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => read++ === 0
          ? { done: false, value: encoder.encode('event: token\ndata: {"text":"Hi"}\n\nevent: complete\ndata: {"status":"complete"}\n\n') }
          : { done: true },
        releaseLock: () => {},
      }),
    },
  };
  let request;
  const result = await streamChatTurn({
    url: 'https://example.test/chat',
    token: 'token-1',
    payload: { message: 'hello' },
    fetchImpl: async (_url, options) => { request = options; return response; },
    onEvent: (event) => received.push(event),
  });

  assert.equal(request.headers.Authorization, 'Bearer token-1');
  assert.equal(result.content, 'Hi');
  assert.deepEqual(received.map((event) => event.event), ['token', 'complete']);
});

test('streamChatTurn rejects structured server error events', async () => {
  const encoder = new TextEncoder();
  let read = 0;
  const response = {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => read++ === 0
          ? { done: false, value: encoder.encode('event: error\ndata: {"code":"auth/unauthenticated","error":"Token expired","retryable":true}\n\n') }
          : { done: true },
        releaseLock: () => {},
      }),
    },
  };

  await assert.rejects(
    () => streamChatTurn({
      url: 'https://example.test/chat',
      token: 'expired',
      payload: { message: 'hello' },
      fetchImpl: async () => response,
    }),
    (error) => error instanceof ChatStreamError
      && error.code === 'auth/unauthenticated'
      && error.details.retryable === true,
  );
});

test('streamChatTurn rejects EOF without a terminal complete event', async () => {
  const encoder = new TextEncoder();
  let read = 0;
  const response = {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => read++ === 0
          ? { done: false, value: encoder.encode('event: token\ndata: {"text":"partial"}\n\n') }
          : { done: true },
        releaseLock: () => {},
      }),
    },
  };

  await assert.rejects(
    () => streamChatTurn({
      url: 'https://example.test/chat',
      token: 'token',
      payload: { message: 'hello' },
      fetchImpl: async () => response,
    }),
    (error) => error.code === 'chat/incomplete-stream' && error.details.content === 'partial',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { createChatIds, parseSseEvents, streamChatTurn } from './chatStreamService.js';

test('createChatIds returns stable identifiers for a turn', () => {
  const ids = createChatIds(() => 'id-1');
  assert.deepEqual(ids, {
    chatId: 'id-1',
    turnId: 'id-1',
    runId: 'id-1',
    userMessageId: 'id-1',
  });
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

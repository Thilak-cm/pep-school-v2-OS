import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abortActiveChatRequest,
  chatErrorMessage,
  runAuthenticatedChatTurn,
} from './chatTurnController.js';

const stableIds = {
  chatId: 'chat-1',
  turnId: 'turn-1',
  runId: 'run-1',
  userMessageId: 'user-1',
};

test('typed auth failure force-refreshes once with stable turn IDs and a new run ID', async () => {
  const tokenCalls = [];
  const payloads = [];
  const runChanges = [];
  let streamCalls = 0;
  const authError = Object.assign(new Error('Expired'), { code: 'auth/unauthenticated', status: 401 });

  const outcome = await runAuthenticatedChatTurn({
    currentUser: { getIdToken: async (forceRefresh) => { tokenCalls.push(forceRefresh); return forceRefresh ? 'fresh' : 'stale'; } },
    url: 'https://example.test/chat',
    signal: new AbortController().signal,
    studentId: 'student-1',
    chatId: 'chat-1',
    ids: stableIds,
    message: 'Hello',
    createRunId: () => 'run-2',
    onRunChange: (ids) => runChanges.push(ids),
    stream: async ({ payload }) => {
      payloads.push(payload);
      streamCalls += 1;
      if (streamCalls === 1) throw authError;
      return { content: 'Hi', status: 'complete' };
    },
  });

  assert.deepEqual(tokenCalls, [false, true]);
  assert.equal(payloads[0].runId, 'run-1');
  assert.equal(payloads[1].runId, 'run-2');
  for (const key of ['chatId', 'turnId', 'userMessageId']) {
    assert.equal(payloads[1][key], payloads[0][key]);
  }
  assert.equal(runChanges[0].runId, 'run-2');
  assert.equal(outcome.ids.runId, 'run-2');
});

test('auth retry stays failed after one force refresh and exposes a friendly error', async () => {
  const authError = Object.assign(new Error('Still expired'), { code: 'auth/unauthenticated' });
  let streamCalls = 0;

  await assert.rejects(() => runAuthenticatedChatTurn({
    currentUser: { getIdToken: async () => 'token' },
    url: 'https://example.test/chat',
    signal: new AbortController().signal,
    studentId: 'student-1',
    chatId: 'chat-1',
    ids: stableIds,
    message: 'Hello',
    createRunId: () => 'run-2',
    stream: async () => { streamCalls += 1; throw authError; },
  }), authError);

  assert.equal(streamCalls, 2);
  assert.equal(chatErrorMessage(authError), 'Your session expired. Please sign in again.');
});

test('an auth-shaped failure after tokens does not replay the turn', async () => {
  const authError = Object.assign(new Error('Late auth failure'), { code: 'auth/unauthenticated' });
  let streamCalls = 0;

  await assert.rejects(() => runAuthenticatedChatTurn({
    currentUser: { getIdToken: async () => 'token' },
    url: 'https://example.test/chat',
    signal: new AbortController().signal,
    studentId: 'student-1',
    chatId: 'chat-1',
    ids: stableIds,
    message: 'Hello',
    stream: async ({ onEvent }) => {
      streamCalls += 1;
      onEvent({ event: 'token', data: { text: 'partial' } });
      throw authError;
    },
  }), authError);

  assert.equal(streamCalls, 1);
});

test('stop aborts but retains the request; navigation aborts and clears it', () => {
  const stopController = new AbortController();
  const stopRef = { current: stopController };
  assert.equal(abortActiveChatRequest(stopRef), true);
  assert.equal(stopController.signal.aborted, true);
  assert.equal(stopRef.current, stopController);

  const navigationController = new AbortController();
  const navigationRef = { current: navigationController };
  assert.equal(abortActiveChatRequest(navigationRef, { clear: true }), true);
  assert.equal(navigationController.signal.aborted, true);
  assert.equal(navigationRef.current, null);
});

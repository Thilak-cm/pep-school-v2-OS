import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abortActiveChatRequest,
  chatErrorMessage,
  runAuthenticatedChatTurn,
  settlePresentedChatTurn,
} from './chatTurnController.js';
import { createChatTokenPresentation } from './chatTokenPresentation.js';

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

async function runPresentedLifecycle({ token = '', error = null }) {
  const order = [];
  let frame = null;
  const presentation = createChatTokenPresentation({
    onToken: (text) => order.push(`text:${text}`),
    onProgressChange: () => {},
    onFirstPresented: () => {},
    requestFrame: (callback) => { frame = callback; return 1; },
    cancelFrame: () => { frame = null; },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    now: () => 0,
  });

  const settled = settlePresentedChatTurn({
    presentation,
    run: async () => {
      if (token) presentation.enqueue(token);
      if (error) throw error;
      return { status: 'complete' };
    },
    onComplete: () => order.push('terminal:complete'),
    onError: (streamError) => order.push(`terminal:${streamError.status || 'failed'}`),
  });
  await Promise.resolve();
  while (frame) {
    const callback = frame;
    frame = null;
    callback();
  }
  await settled;
  return order;
}

test('presented lifecycle orders queued text before complete terminal state', async () => {
  assert.deepEqual(await runPresentedLifecycle({ token: 'answer' }), [
    'text:answer',
    'terminal:complete',
  ]);
});

test('presented lifecycle orders queued text before interruption state', async () => {
  assert.deepEqual(await runPresentedLifecycle({
    token: 'partial',
    error: Object.assign(new Error('stopped'), { status: 'interrupted' }),
  }), [
    'text:partial',
    'terminal:interrupted',
  ]);
});

test('presented lifecycle orders queued text before post-token failure state', async () => {
  assert.deepEqual(await runPresentedLifecycle({ token: 'partial', error: new Error('failed') }), [
    'text:partial',
    'terminal:failed',
  ]);
});

test('presented lifecycle settles pre-token failure directly into retry state', async () => {
  assert.deepEqual(await runPresentedLifecycle({ error: new Error('failed') }), [
    'terminal:failed',
  ]);
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

import test from 'node:test';
import assert from 'node:assert/strict';

import { canManageChildChat } from './chat/chatPermissions.js';
import {
  appendOptimisticTurn,
  applyChatStreamEvent,
  buildRetryRequest,
  reconcileMessagesWithTurns,
} from './chat/childChatState.js';

const ids = {
  chatId: 'chat-1',
  turnId: 'turn-1',
  runId: 'run-1',
  userMessageId: 'user-1',
};

test('ChildChat state executes optimistic and progressive token transitions', () => {
  let messages = appendOptimisticTurn([], {
    ids,
    message: 'How is concentration developing?',
    authorId: 'teacher-1',
    authorName: 'Teacher',
    createdAt: new Date(1000),
  });

  assert.deepEqual(messages.map((message) => message.status), ['complete', 'streaming']);
  assert.equal(messages[1].retry.turnId, 'turn-1');
  messages = applyChatStreamEvent(messages, {
    event: 'token',
    data: { text: 'Concentration ' },
  }, ids, ids.userMessageId);
  messages = applyChatStreamEvent(messages, {
    event: 'token',
    data: { text: 'is growing.' },
  }, ids, ids.userMessageId);
  assert.equal(messages[1].content, 'Concentration is growing.');
});

test('ChildChat retry action reuses logical IDs and changes only the run ID', () => {
  const messages = [
    { id: 'user-1', turnId: 'turn-1', role: 'user', content: 'Original question' },
    {
      id: 'run-1-assistant',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'failed',
      retry: { chatId: 'chat-1', turnId: 'turn-1', userMessageId: 'user-1' },
    },
  ];

  const retry = buildRetryRequest({
    messages,
    assistantMessage: messages[1],
    chatId: 'chat-1',
    runId: 'run-2',
  });

  assert.deepEqual(retry, {
    ids: {
      chatId: 'chat-1',
      turnId: 'turn-1',
      userMessageId: 'user-1',
      runId: 'run-2',
    },
    message: 'Original question',
  });
  const optimisticRetry = appendOptimisticTurn(messages, {
    ids: retry.ids,
    message: retry.message,
    authorId: 'teacher-1',
    createdAt: new Date(2000),
    isRetry: true,
  });
  assert.equal(optimisticRetry.filter((message) => message.role === 'user').length, 1);
  assert.equal(optimisticRetry.at(-1).id, 'run-2-assistant');
});

test('ChildChat reload derives failed pre-token retry from the turn without an assistant message', () => {
  const persistedMessages = [
    { id: 'user-1', turnId: 'turn-1', role: 'user', content: 'Original question', status: 'complete' },
  ];
  const turns = [{
    id: 'turn-1',
    runId: 'run-1',
    assistantMessageId: 'run-1-assistant',
    userMessageId: 'user-1',
    status: 'failed',
  }];

  const reconciled = reconcileMessagesWithTurns(
    persistedMessages,
    turns,
    'chat-1',
    new Set(['user-1']),
  );

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].role, 'user');
  assert.equal(reconciled.some((message) => message.role === 'assistant'), false);
  assert.deepEqual(reconciled[0].turnRetry, {
    chatId: 'chat-1',
    turnId: 'turn-1',
    userMessageId: 'user-1',
    runId: 'run-1',
    assistantMessageId: 'run-1-assistant',
    status: 'failed',
  });

  const retry = buildRetryRequest({
    messages: reconciled,
    assistantMessage: reconciled[0],
    chatId: 'chat-1',
    runId: 'run-2',
  });
  assert.deepEqual(retry.ids, {
    chatId: 'chat-1',
    turnId: 'turn-1',
    userMessageId: 'user-1',
    runId: 'run-2',
  });
  assert.equal(retry.message, 'Original question');

  const optimisticRetry = appendOptimisticTurn(reconciled, {
    ids: retry.ids,
    message: retry.message,
    authorId: 'teacher-1',
    createdAt: new Date(2000),
    isRetry: true,
  });
  assert.equal(optimisticRetry.filter((message) => message.role === 'user').length, 1);
  assert.equal(optimisticRetry.at(-1).id, 'run-2-assistant');
});

test('ChildChat exposes role controls only to creator and scoped admins', () => {
  const chat = { createdBy: 'creator', classroomId: 'allstars' };
  const currentUser = { uid: 'reader' };
  assert.equal(canManageChildChat({ chat, currentUser, userRole: 'teacher' }), false);
  assert.equal(canManageChildChat({
    chat,
    currentUser,
    userRole: 'classroomadmin',
    manageableClassrooms: ['allstars'],
  }), true);
  assert.equal(canManageChildChat({ chat, currentUser, userRole: 'superadmin' }), true);
});

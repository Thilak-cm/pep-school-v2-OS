import test from 'node:test';
import assert from 'node:assert/strict';

import { acquireChatTurn } from '../../../../functions/chat/chatRepository.js';
import { appendOptimisticTurn } from './childChatState.js';
import { runAuthenticatedChatTurn } from './chatTurnController.js';

import {
  getChatStudentName,
  getSuggestedChatPrompts,
  getToolStatusQuips,
  resolveChatMessage,
} from './chatStartupPresentation.js';

test('chat student naming prefers firstName, then displayName, then neutral copy', () => {
  assert.equal(getChatStudentName({ firstName: 'Mira', displayName: 'Mira Shah' }), 'Mira');
  assert.equal(getChatStudentName({ displayName: 'Mira Shah' }), 'Mira Shah');
  assert.equal(getChatStudentName({ name: 'Legacy Name' }), 'this student');
  assert.equal(getChatStudentName(null), 'this student');
});

test('new chat exposes exactly the four approved student-specific prompts', () => {
  assert.deepEqual(getSuggestedChatPrompts({ firstName: 'Mira' }), [
    'How is Mira progressing?',
    "What patterns do you notice in Mira's recent observations?",
    'What should I focus on next with Mira?',
    'Help me draft a parent-friendly update about Mira.',
  ]);
  assert.deepEqual(getSuggestedChatPrompts({}), [
    'How is this student progressing?',
    "What patterns do you notice in this student's recent observations?",
    'What should I focus on next with this student?',
    'Help me draft a parent-friendly update about this student.',
  ]);
});

test('explicit suggestion text becomes the outgoing user message without mutating input policy', () => {
  assert.equal(resolveChatMessage({
    input: 'typed draft',
    explicitMessage: '  How is Mira progressing?  ',
  }), 'How is Mira progressing?');
  assert.equal(resolveChatMessage({ input: '  typed draft  ' }), 'typed draft');
  assert.equal(resolveChatMessage({ retryMessage: 'Original question', explicitMessage: 'Suggestion' }), 'Original question');
});

function fakePersistenceDb() {
  const docs = new Map();
  const makeRef = (path) => ({
    path,
    id: path.split('/').at(-1),
    collection: (name) => ({ doc: (id) => makeRef(`${path}/${name}/${id}`) }),
  });
  const snapshot = (ref) => ({
    exists: docs.has(ref.path),
    id: ref.id,
    ref,
    data: () => docs.get(ref.path),
  });
  return {
    collection: (...parts) => ({ doc: (id) => makeRef([...parts, id].join('/')) }),
    runTransaction: async (callback) => callback({
      get: async (ref) => snapshot(ref),
      create: (ref, data) => docs.set(ref.path, { ...data }),
      update: (ref, data) => docs.set(ref.path, { ...(docs.get(ref.path) || {}), ...data }),
    }),
    docs,
  };
}

test('selected suggestion alone follows the normal request and persistence path', async () => {
  const suggestions = getSuggestedChatPrompts({ firstName: 'Mira' });
  const selected = suggestions[2];
  const unselected = suggestions.filter((suggestion) => suggestion !== selected);
  const quips = getToolStatusQuips({
    names: ['fetch_observations', 'fetch_media'],
    student: { firstName: 'Mira' },
    random: () => 0,
  });
  const message = resolveChatMessage({
    input: 'composer draft',
    explicitMessage: selected,
  });
  const ids = {
    chatId: 'chat-1',
    turnId: 'turn-1',
    runId: 'run-1',
    userMessageId: 'user-1',
  };
  const db = fakePersistenceDb();
  let requestPayload;

  const optimistic = appendOptimisticTurn([], {
    ids,
    message,
    authorId: 'teacher-1',
    createdAt: new Date(0),
  });
  await runAuthenticatedChatTurn({
    currentUser: { getIdToken: async () => 'firebase-token' },
    url: 'https://example.test/childChatStream',
    signal: new AbortController().signal,
    studentId: 'student-1',
    chatId: ids.chatId,
    ids,
    message,
    stream: async ({ payload }) => {
      requestPayload = payload;
      await acquireChatTurn({
        db,
        studentId: payload.studentId,
        chatId: payload.chatId,
        turnId: payload.turnId,
        runId: payload.runId,
        userMessageId: payload.userMessageId,
        content: payload.message,
        authorId: 'teacher-1',
        classroomId: 'classroom-1',
      });
      return { content: '', status: 'complete' };
    },
  });

  assert.equal(requestPayload.message, selected);
  assert.deepEqual(optimistic.map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: selected },
    { role: 'assistant', content: '' },
  ]);

  const messageDoc = db.docs.get('students/student-1/chats/chat-1/messages/user-1');
  const turnDoc = db.docs.get('students/student-1/chats/chat-1/turns/turn-1');
  const chatDoc = db.docs.get('students/student-1/chats/chat-1');
  assert.equal(messageDoc.content, selected);
  assert.equal(chatDoc.name, selected);
  assert.equal(turnDoc.userMessageId, ids.userMessageId);

  const persisted = JSON.stringify({ messageDoc, turnDoc, chatDoc });
  for (const transientCopy of [...unselected, ...quips, 'composer draft']) {
    assert.equal(persisted.includes(transientCopy), false, `${transientCopy} was transient`);
    assert.equal(JSON.stringify(requestPayload).includes(transientCopy), false);
  }
});

test('tool quips select once per recognized tool, preserve order, and hide unknown names', () => {
  const quips = getToolStatusQuips({
    names: ['unknown_tool', 'fetch_observations', 'fetch_media'],
    student: { firstName: 'Mira' },
    random: () => 0,
  });
  assert.deepEqual(quips, [
    'Flipping through my notes on Mira...',
    'Pulling up some photos...',
  ]);
  assert.deepEqual(getToolStatusQuips({ names: ['unknown_tool'], student: {}, random: () => 0 }), []);
  assert.equal(quips.some((quip) => quip.includes('fetch_')), false);
});

test('tool quip selection supports every approved tool and deterministic alternatives', () => {
  const names = [
    'fetch_observations', 'fetch_media', 'fetch_interviews', 'fetch_term_reports',
    'fetch_baseline_reports', 'fetch_weekly_snapshot', 'fetch_snapshot_history',
    'fetch_writing_analysis', 'fetch_monthly_plan', 'fetch_placements', 'fetch_chat_history',
  ];
  const quips = getToolStatusQuips({ names, student: { displayName: 'Mira Shah' }, random: () => 0.999 });
  assert.equal(quips.length, 11);
  assert.equal(quips[0], "Thumbing through Mira Shah's observation log...");
  assert.equal(quips.at(-1), 'Flipping back a few pages in our conversation...');
});

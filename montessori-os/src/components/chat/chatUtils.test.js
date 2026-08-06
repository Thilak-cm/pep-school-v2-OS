import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeMessageSnapshot, sortMessagesForDisplay } from './chatUtils.js';

test('snapshot merge retains the active assistant while the user message is persisted', () => {
  const previous = [
    { id: 'user-1', role: 'user', content: 'Question', createdAt: new Date(1000) },
    { id: 'run-1-assistant', role: 'assistant', content: 'Progres', status: 'streaming', createdAt: new Date(1001) },
  ];
  const incoming = [
    { id: 'user-1', role: 'user', content: 'Question', status: 'complete', createdAt: new Date(1000) },
  ];

  const merged = mergeMessageSnapshot(previous, incoming, new Set(['run-1-assistant']));

  assert.equal(merged.length, 2);
  assert.equal(merged[0].status, 'complete');
  assert.equal(merged[1].content, 'Progres');
  assert.equal(merged[1].status, 'streaming');
});

test('progressive tokens survive snapshots until the authoritative assistant replaces them', () => {
  const progressive = mergeMessageSnapshot([
    { id: 'run-1-assistant', role: 'assistant', content: 'Progressive', status: 'streaming', createdAt: new Date(1001) },
  ], [], new Set(['run-1-assistant']));

  const authoritative = mergeMessageSnapshot(progressive, [
    { id: 'run-1-assistant', role: 'assistant', content: 'Progressive answer', status: 'complete', createdAt: new Date(1001) },
  ]);

  assert.deepEqual(authoritative.map((message) => message.id), ['run-1-assistant']);
  assert.equal(authoritative[0].content, 'Progressive answer');
  assert.equal(authoritative[0].status, 'complete');
});

test('authoritative user timestamp cannot move a streaming reply above its initiating message', () => {
  const previous = [
    {
      id: 'user-z',
      turnId: 'turn-1',
      role: 'user',
      content: 'Question',
      createdAt: new Date(1000),
    },
    {
      id: 'run-a-assistant',
      turnId: 'turn-1',
      role: 'assistant',
      content: 'Streaming answer',
      status: 'streaming',
      createdAt: new Date(1001),
    },
  ];
  const incoming = [{
    id: 'user-z',
    turnId: 'turn-1',
    role: 'user',
    content: 'Question',
    status: 'complete',
    createdAt: new Date(2000),
  }];

  const merged = mergeMessageSnapshot(previous, incoming, new Set(['run-a-assistant']));

  assert.deepEqual(merged.map((message) => message.id), ['user-z', 'run-a-assistant']);
});

test('same-turn user precedes assistant attempts with missing, equal, or skewed timestamps', () => {
  const scenarios = [
    { userAt: undefined, assistantAt: undefined },
    { userAt: new Date(1000), assistantAt: new Date(1000) },
    { userAt: new Date(2000), assistantAt: new Date(1000) },
  ];

  scenarios.forEach(({ userAt, assistantAt }) => {
    const sorted = sortMessagesForDisplay([
      { id: 'assistant-a', turnId: 'turn-1', role: 'assistant', createdAt: assistantAt },
      { id: 'user-z', turnId: 'turn-1', role: 'user', createdAt: userAt },
    ]);
    assert.deepEqual(sorted.map((message) => message.id), ['user-z', 'assistant-a']);
  });
});

test('later retries retain timestamp chronology while still following their turn user', () => {
  const sorted = sortMessagesForDisplay([
    { id: 'retry-assistant', turnId: 'turn-1', role: 'assistant', status: 'streaming', createdAt: new Date(4000) },
    { id: 'next-user', turnId: 'turn-2', role: 'user', createdAt: new Date(3000) },
    { id: 'first-assistant', turnId: 'turn-1', role: 'assistant', status: 'interrupted', createdAt: new Date(2000) },
    { id: 'first-user', turnId: 'turn-1', role: 'user', createdAt: new Date(1000) },
  ]);

  assert.deepEqual(sorted.map((message) => message.id), [
    'first-user',
    'first-assistant',
    'next-user',
    'retry-assistant',
  ]);
});

test('same-turn attempts with equal timestamps preserve their existing attempt order', () => {
  const sorted = sortMessagesForDisplay([
    { id: 'first-assistant', turnId: 'turn-1', role: 'assistant', status: 'interrupted' },
    { id: 'retry-assistant', turnId: 'turn-1', role: 'assistant', status: 'streaming' },
    { id: 'turn-user', turnId: 'turn-1', role: 'user' },
  ]);

  assert.deepEqual(sorted.map((message) => message.id), [
    'turn-user',
    'first-assistant',
    'retry-assistant',
  ]);
});

test('legacy messages without turn IDs continue to sort by timestamp then ID', () => {
  const sorted = sortMessagesForDisplay([
    { id: 'legacy-z', role: 'assistant', createdAt: new Date(2000) },
    { id: 'legacy-b', role: 'user', createdAt: new Date(1000) },
    { id: 'legacy-a', role: 'assistant', createdAt: new Date(1000) },
  ]);

  assert.deepEqual(sorted.map((message) => message.id), ['legacy-a', 'legacy-b', 'legacy-z']);
});

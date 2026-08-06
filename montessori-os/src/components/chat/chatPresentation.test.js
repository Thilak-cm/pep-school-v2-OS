import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatChatTimestamp,
  getBottomDistance,
  getComposerState,
  isNearBottom,
  safeLinkProps,
  shouldShowAssistantActions,
} from './chatPresentation.js';

const now = new Date(2026, 7, 6, 12, 0, 0, 0);

test('chat timestamps use the exact relative and calendar forms', () => {
  assert.equal(formatChatTimestamp(new Date(now.getTime() - 30_000), now), 'Just now');
  assert.equal(formatChatTimestamp(new Date(now.getTime() - 60_000), now), '1 min ago');
  assert.equal(formatChatTimestamp(new Date(now.getTime() - 5 * 60_000), now), '5 mins ago');
  assert.equal(formatChatTimestamp(new Date(now.getTime() - 60 * 60_000), now), '1 hour ago');
  assert.equal(formatChatTimestamp(new Date(now.getTime() - 5 * 60 * 60_000), now), '5 hours ago');
  assert.equal(formatChatTimestamp(new Date(2026, 7, 5, 10, 0, 0), now), 'Yesterday');
  assert.equal(formatChatTimestamp(new Date(2026, 6, 15, 10, 0, 0), now), 'Jul 15');
  assert.equal(formatChatTimestamp(new Date(2025, 6, 15, 10, 0, 0), now), 'Jul 15, 2025');
});

test('chat timestamps accept Firestore-like timestamp values and reject missing values', () => {
  assert.equal(formatChatTimestamp({ seconds: (now.getTime() - 2 * 60_000) / 1000 }, now), '2 mins ago');
  assert.equal(formatChatTimestamp(null, now), '');
});

test('follow mode uses the shared 200px threshold', () => {
  const metrics = { scrollHeight: 1200, scrollTop: 800, clientHeight: 200 };
  assert.equal(getBottomDistance(metrics), 200);
  assert.equal(isNearBottom(metrics), true);
  assert.equal(isNearBottom({ ...metrics, scrollTop: 799 }), false);
});

test('assistant actions appear only for visible terminal responses', () => {
  assert.equal(shouldShowAssistantActions({ role: 'assistant', content: 'partial', status: 'interrupted' }), true);
  assert.equal(shouldShowAssistantActions({ role: 'assistant', content: 'answer', status: 'complete' }), true);
  assert.equal(shouldShowAssistantActions({ role: 'assistant', content: 'streaming', status: 'streaming' }), false);
  assert.equal(shouldShowAssistantActions({ role: 'assistant', content: '', status: 'interrupted' }), false);
  assert.equal(shouldShowAssistantActions({ role: 'user', content: 'question', status: 'complete' }), false);
});

test('composer remains editable during streaming while send is blocked and stop is shown', () => {
  assert.deepEqual(getComposerState({ loading: true, input: 'draft' }), {
    inputDisabled: false,
    sendDisabled: true,
    showStop: true,
  });
  assert.deepEqual(getComposerState({ loading: false, input: '' }), {
    inputDisabled: false,
    sendDisabled: true,
    showStop: false,
  });
});

test('safe links get external target attributes while unsafe schemes are rejected', () => {
  assert.deepEqual(safeLinkProps('https://example.com'), {
    href: 'https://example.com',
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  assert.deepEqual(safeLinkProps('mailto:teacher@example.com'), {
    href: 'mailto:teacher@example.com',
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  assert.deepEqual(safeLinkProps('javascript:alert(1)'), { href: undefined });
});

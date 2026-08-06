import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  appendOptimisticTurn,
  applyChatStreamEvent,
  createMessageAnimationState,
  registerAssistantAttemptAnimation,
  registerOptimisticEntryAnimations,
  resetMessageAnimationState,
  shouldAnimateMessage,
} from './childChatState.js';
import { getBubbleAnimationSx } from './chatPresentation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');
const source = readFileSync(join(__dirname, 'MessageBubble.jsx'), 'utf-8');
const userMetaSource = source.slice(
  source.indexOf('function UserMetaRow'),
  source.indexOf('function AssistantMetaRow'),
);
const assistantMetaSource = source.slice(
  source.indexOf('function AssistantMetaRow'),
  source.indexOf('export const UserBubble'),
);
let vite;
let UserBubble;
let AssistantBubble;

before(async () => {
  vite = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  ({ UserBubble, AssistantBubble } = await vite.ssrLoadModule('/src/components/chat/MessageBubble.jsx'));
});

after(async () => {
  await vite?.close();
});

test('message bubbles use role-specific always-visible metadata and terminal assistant actions', () => {
  assert.match(source, /UserBubble/);
  assert.match(source, /AssistantBubble/);
  assert.match(source, /ThumbsUp/);
  assert.match(source, /shouldShowAssistantActions/);
  assert.doesNotMatch(source, /onTouchStart/);
  assert.doesNotMatch(source, /opacity:\s*visible\s*\?/);
  assert.doesNotMatch(source, /formatTimestamp/);
});

test('optimistic user metadata renders immediately and is permanently visible', () => {
  const html = renderToStaticMarkup(React.createElement(UserBubble, {
    message: {
      id: 'optimistic-user',
      role: 'user',
      content: 'A new question',
      createdAt: new Date(),
    },
  }));

  assert.match(html, /data-message-meta="user"/);
  assert.match(html, />Just now</);
  assert.match(html, /aria-label="Copy message"/);
  assert.match(userMetaSource, /display:\s*'flex'/);
  assert.match(userMetaSource, /visibility:\s*'visible'/);
  assert.match(userMetaSource, /opacity:\s*1/);
  assert.doesNotMatch(userMetaSource, /&:hover|onMouse|onTouch/);
});

test('terminal assistant actions render permanently without hover or touch reveal', () => {
  const completeHtml = renderToStaticMarkup(React.createElement(AssistantBubble, {
    message: {
      id: 'assistant-complete',
      role: 'assistant',
      content: 'A complete answer',
      status: 'complete',
    },
  }));
  const interruptedHtml = renderToStaticMarkup(React.createElement(AssistantBubble, {
    message: {
      id: 'assistant-interrupted',
      role: 'assistant',
      content: 'A partial answer',
      status: 'interrupted',
    },
  }));
  const streamingHtml = renderToStaticMarkup(React.createElement(AssistantBubble, {
    message: {
      id: 'assistant-streaming',
      role: 'assistant',
      content: 'Still changing',
      status: 'streaming',
    },
  }));

  [completeHtml, interruptedHtml].forEach((html) => {
    assert.match(html, /data-message-meta="assistant"/);
    assert.match(html, /aria-label="Copy message"/);
    assert.match(html, /aria-label="Helpful"/);
  });
  assert.doesNotMatch(streamingHtml, /data-message-meta="assistant"/);
  assert.match(assistantMetaSource, /display:\s*'flex'/);
  assert.match(assistantMetaSource, /visibility:\s*'visible'/);
  assert.match(assistantMetaSource, /opacity:\s*1/);
  assert.doesNotMatch(assistantMetaSource, /&:hover|onMouse|onTouch/);
});

test('animation eligibility follows message identity across optimistic and streamed updates', () => {
  const animationState = createMessageAnimationState();
  const loadedHistory = [
    { id: 'history-user', role: 'user', content: 'Earlier question' },
    { id: 'history-assistant', role: 'assistant', content: 'Earlier answer' },
  ];
  loadedHistory.forEach((message) => {
    assert.equal(shouldAnimateMessage(animationState, message.id), false, 'loaded history is static');
  });

  const ids = {
    chatId: 'chat-1',
    turnId: 'turn-1',
    userMessageId: 'user-1',
    runId: 'run-1',
  };
  const optimistic = appendOptimisticTurn(loadedHistory, {
    ids,
    message: 'New question',
    authorId: 'teacher-1',
    createdAt: new Date('2026-08-06T12:00:00Z'),
  });
  registerOptimisticEntryAnimations(animationState, ids);

  assert.equal(shouldAnimateMessage(animationState, ids.userMessageId), true);
  assert.equal(shouldAnimateMessage(animationState, `${ids.runId}-assistant`), true);
  assert.equal(shouldAnimateMessage(animationState, 'history-user'), false);
  assert.equal(shouldAnimateMessage(animationState, 'history-assistant'), false);

  const streamed = applyChatStreamEvent(optimistic, {
    event: 'token',
    data: { text: 'First token' },
  }, ids, ids.userMessageId);
  const streamedAssistant = streamed.find((message) => message.role === 'assistant'
    && message.runId === ids.runId);

  assert.equal(streamedAssistant.id, `${ids.runId}-assistant`, 'token growth preserves the bubble key');
  assert.equal(shouldAnimateMessage(animationState, streamedAssistant.id), true);
  assert.equal(animationState.entryMessageIds.size, 2, 'token growth creates no new animation entry');
});

test('conversation load resets animation state and retry marks only the new assistant attempt', () => {
  const animationState = createMessageAnimationState();
  const initialIds = {
    chatId: 'chat-1',
    turnId: 'turn-1',
    userMessageId: 'user-1',
    runId: 'run-1',
  };
  registerOptimisticEntryAnimations(animationState, initialIds);
  resetMessageAnimationState(animationState);

  assert.equal(shouldAnimateMessage(animationState, 'user-1'), false);
  assert.equal(shouldAnimateMessage(animationState, 'run-1-assistant'), false);

  const retryIds = { ...initialIds, runId: 'run-2' };
  assert.deepEqual(registerOptimisticEntryAnimations(animationState, retryIds, true), [
    'run-2-assistant',
  ]);
  assert.equal(shouldAnimateMessage(animationState, 'user-1'), false, 'retry reuses the static user bubble');
  assert.equal(shouldAnimateMessage(animationState, 'run-1-assistant'), false, 'the failed attempt stays static');
  assert.equal(shouldAnimateMessage(animationState, 'run-2-assistant'), true, 'the new attempt enters once');

  registerAssistantAttemptAnimation(animationState, 'run-3-assistant');
  assert.equal(shouldAnimateMessage(animationState, 'run-3-assistant'), true, 'a replaced pre-token run is a new identity');
});

test('bubble animation contract is subtle and disabled for reduced motion', () => {
  const animated = getBubbleAnimationSx(true);
  const staticBubble = getBubbleAnimationSx(false);

  assert.equal(animated.animation, 'chatBubbleEnter 180ms ease-out both');
  assert.deepEqual(animated['@keyframes chatBubbleEnter'].from, {
    opacity: 0,
    transform: 'translateY(6px)',
  });
  assert.equal(animated['@media (prefers-reduced-motion: reduce)'].animation, 'none');
  assert.equal(staticBubble.animation, 'none');
  assert.match(source, /getBubbleAnimationSx\(animate\)/);
});

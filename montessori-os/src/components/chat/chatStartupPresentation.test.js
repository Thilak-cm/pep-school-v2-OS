import test from 'node:test';
import assert from 'node:assert/strict';

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

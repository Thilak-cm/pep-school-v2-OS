import test from 'node:test';
import assert from 'node:assert/strict';

import { stripQuotes, ASSISTANT_TIMEOUT_MS, collectInlineMatches, classifyLine, shouldSkipCancelledChat } from './chatUtils.js';

// --- stripQuotes ---

test('stripQuotes removes surrounding double quotes', () => {
  assert.equal(stripQuotes('"hello world"'), 'hello world');
});

test('stripQuotes removes surrounding single quotes', () => {
  assert.equal(stripQuotes("'hello world'"), 'hello world');
});

test('stripQuotes removes only leading double quote', () => {
  assert.equal(stripQuotes('"hello world'), 'hello world');
});

test('stripQuotes removes only trailing single quote', () => {
  assert.equal(stripQuotes("hello world'"), 'hello world');
});

test('stripQuotes returns unchanged string without quotes', () => {
  assert.equal(stripQuotes('hello world'), 'hello world');
});

test('stripQuotes preserves internal quotes', () => {
  assert.equal(stripQuotes('"he said "hi" there"'), 'he said "hi" there');
});

test('stripQuotes returns null for null input', () => {
  assert.equal(stripQuotes(null), null);
});

test('stripQuotes returns undefined for undefined input', () => {
  assert.equal(stripQuotes(undefined), undefined);
});

test('stripQuotes returns empty string for empty string', () => {
  assert.equal(stripQuotes(''), '');
});

// --- ASSISTANT_TIMEOUT_MS ---

test('ASSISTANT_TIMEOUT_MS is 30 seconds', () => {
  assert.equal(ASSISTANT_TIMEOUT_MS, 30_000);
});

// --- collectInlineMatches ---

test('collectInlineMatches returns empty array for null', () => {
  assert.deepEqual(collectInlineMatches(null), []);
});

test('collectInlineMatches returns empty array for empty string', () => {
  assert.deepEqual(collectInlineMatches(''), []);
});

test('collectInlineMatches returns empty array for plain text', () => {
  assert.deepEqual(collectInlineMatches('hello world'), []);
});

test('collectInlineMatches finds bold text', () => {
  const matches = collectInlineMatches('hello **bold** world');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'bold');
  assert.equal(matches[0].content, 'bold');
  assert.equal(matches[0].start, 6);
  assert.equal(matches[0].end, 14);
});

test('collectInlineMatches finds italic text', () => {
  const matches = collectInlineMatches('hello *italic* world');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'italic');
  assert.equal(matches[0].content, 'italic');
});

test('collectInlineMatches finds inline code', () => {
  const matches = collectInlineMatches('hello `code` world');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'code');
  assert.equal(matches[0].content, 'code');
});

test('collectInlineMatches finds bold and code together', () => {
  const matches = collectInlineMatches('**bold** and `code`');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].type, 'bold');
  assert.equal(matches[0].content, 'bold');
  assert.equal(matches[1].type, 'code');
  assert.equal(matches[1].content, 'code');
});

test('collectInlineMatches prefers bold over italic (no overlap)', () => {
  const matches = collectInlineMatches('**bold text** here');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'bold');
  assert.equal(matches[0].content, 'bold text');
});

test('collectInlineMatches returns matches sorted by position', () => {
  const matches = collectInlineMatches('`code` then **bold**');
  assert.equal(matches.length, 2);
  assert.ok(matches[0].start < matches[1].start);
});

test('collectInlineMatches is stable across multiple calls', () => {
  // Ensures regex lastIndex is properly reset
  const first = collectInlineMatches('**bold** *italic*');
  const second = collectInlineMatches('**bold** *italic*');
  assert.deepEqual(first, second);
});

// --- classifyLine ---

test('classifyLine identifies blank lines', () => {
  assert.deepEqual(classifyLine(''), { type: 'blank', content: '' });
  assert.deepEqual(classifyLine('   '), { type: 'blank', content: '' });
});

test('classifyLine identifies h1 headings', () => {
  const result = classifyLine('# Hello');
  assert.equal(result.type, 'h1');
  assert.equal(result.content, 'Hello');
});

test('classifyLine identifies h2 headings', () => {
  const result = classifyLine('## Subheading');
  assert.equal(result.type, 'h2');
  assert.equal(result.content, 'Subheading');
});

test('classifyLine identifies h3 headings', () => {
  const result = classifyLine('### Minor heading');
  assert.equal(result.type, 'h3');
  assert.equal(result.content, 'Minor heading');
});

test('classifyLine identifies unordered list items with dash', () => {
  const result = classifyLine('- list item');
  assert.equal(result.type, 'ul');
  assert.equal(result.content, 'list item');
});

test('classifyLine identifies unordered list items with asterisk', () => {
  const result = classifyLine('* list item');
  assert.equal(result.type, 'ul');
  assert.equal(result.content, 'list item');
});

test('classifyLine identifies ordered list items', () => {
  const result = classifyLine('1. first item');
  assert.equal(result.type, 'ol');
  assert.equal(result.content, 'first item');
});

test('classifyLine identifies ordered list with multi-digit numbers', () => {
  const result = classifyLine('10. tenth item');
  assert.equal(result.type, 'ol');
  assert.equal(result.content, 'tenth item');
});

test('classifyLine identifies regular paragraphs', () => {
  const result = classifyLine('Just some text');
  assert.equal(result.type, 'paragraph');
  assert.equal(result.content, 'Just some text');
});

test('classifyLine trims leading whitespace', () => {
  const result = classifyLine('   ## Indented heading');
  assert.equal(result.type, 'h2');
  assert.equal(result.content, 'Indented heading');
});

// --- shouldSkipCancelledChat ---

test('shouldSkipCancelledChat returns false when cancelledAt is null', () => {
  assert.equal(shouldSkipCancelledChat(null, 1000), false);
});

test('shouldSkipCancelledChat returns false when cancelledAt is undefined', () => {
  assert.equal(shouldSkipCancelledChat(undefined, 1000), false);
});

test('shouldSkipCancelledChat returns true when cancelledAt is after request start (toMillis)', () => {
  const cancelledAt = { toMillis: () => 2000 };
  assert.equal(shouldSkipCancelledChat(cancelledAt, 1000), true);
});

test('shouldSkipCancelledChat returns false when cancelledAt is before request start (toMillis)', () => {
  const cancelledAt = { toMillis: () => 500 };
  assert.equal(shouldSkipCancelledChat(cancelledAt, 1000), false);
});

test('shouldSkipCancelledChat returns true when cancelledAt uses seconds field (Firestore Timestamp shape)', () => {
  const cancelledAt = { seconds: 2 }; // 2000ms
  assert.equal(shouldSkipCancelledChat(cancelledAt, 1000), true);
});

test('shouldSkipCancelledChat returns false for stale cancellation (seconds before request)', () => {
  const cancelledAt = { seconds: 0 }; // 0ms
  assert.equal(shouldSkipCancelledChat(cancelledAt, 1000), false);
});

test('shouldSkipCancelledChat returns false when cancelledAt equals request start exactly', () => {
  const cancelledAt = { toMillis: () => 1000 };
  assert.equal(shouldSkipCancelledChat(cancelledAt, 1000), false);
});

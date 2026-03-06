import test from 'node:test';
import assert from 'node:assert/strict';

import { stripQuotes, ASSISTANT_TIMEOUT_MS } from './chatUtils.js';

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

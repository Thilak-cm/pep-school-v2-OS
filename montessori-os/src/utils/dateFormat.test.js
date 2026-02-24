import test from 'node:test';
import assert from 'node:assert/strict';

import { getOrdinalSuffix, formatDate, formatTimestamp } from './dateFormat.js';

// --- getOrdinalSuffix ---

test('ordinal suffix: 1st, 2nd, 3rd', () => {
  assert.equal(getOrdinalSuffix(1), 'st');
  assert.equal(getOrdinalSuffix(2), 'nd');
  assert.equal(getOrdinalSuffix(3), 'rd');
});

test('ordinal suffix: teens are all "th" (11th, 12th, 13th)', () => {
  assert.equal(getOrdinalSuffix(11), 'th');
  assert.equal(getOrdinalSuffix(12), 'th');
  assert.equal(getOrdinalSuffix(13), 'th');
});

test('ordinal suffix: 21st, 22nd, 23rd, 31st', () => {
  assert.equal(getOrdinalSuffix(21), 'st');
  assert.equal(getOrdinalSuffix(22), 'nd');
  assert.equal(getOrdinalSuffix(23), 'rd');
  assert.equal(getOrdinalSuffix(31), 'st');
});

test('ordinal suffix: regular "th" values', () => {
  assert.equal(getOrdinalSuffix(4), 'th');
  assert.equal(getOrdinalSuffix(10), 'th');
  assert.equal(getOrdinalSuffix(14), 'th');
  assert.equal(getOrdinalSuffix(20), 'th');
  assert.equal(getOrdinalSuffix(30), 'th');
});

// --- formatDate ---

test('formatDate formats a basic Date object', () => {
  const date = new Date(2026, 0, 2); // Jan 2, 2026
  assert.equal(formatDate(date), 'Jan 2nd 2026');
});

test('formatDate with includeTime', () => {
  const date = new Date(2026, 0, 2, 15, 45); // Jan 2, 2026 3:45 PM
  const result = formatDate(date, true);
  assert.match(result, /Jan 2nd 2026, 3:45 PM/);
});

test('formatDate handles midnight correctly (12:00 AM)', () => {
  const date = new Date(2026, 5, 15, 0, 0); // midnight
  const result = formatDate(date, true);
  assert.match(result, /12:00 AM/);
});

test('formatDate handles noon correctly (12:00 PM)', () => {
  const date = new Date(2026, 5, 15, 12, 0); // noon
  const result = formatDate(date, true);
  assert.match(result, /12:00 PM/);
});

test('formatDate handles Firestore-style timestamp {seconds}', () => {
  const ts = { seconds: 1704153600 }; // Jan 2, 2024 00:00:00 UTC
  const result = formatDate(ts);
  assert.match(result, /Jan/);
  assert.match(result, /2024/);
});

test('formatDate handles Firestore timestamp with toDate()', () => {
  const ts = { toDate: () => new Date(2026, 2, 15) }; // Mar 15, 2026
  assert.equal(formatDate(ts), 'Mar 15th 2026');
});

test('formatDate handles numeric timestamp (ms since epoch)', () => {
  const ts = new Date(2026, 0, 1).getTime();
  const result = formatDate(ts);
  assert.match(result, /Jan 1st 2026/);
});

test('formatDate handles ISO string', () => {
  const result = formatDate('2026-06-15T10:30:00Z');
  assert.match(result, /Jun/);
  assert.match(result, /2026/);
});

test('formatDate returns "Invalid date" for bad input', () => {
  assert.equal(formatDate(null), 'Invalid date');
  assert.equal(formatDate(undefined), 'Invalid date');
  assert.equal(formatDate('not-a-date'), 'Invalid date');
});

// --- formatTimestamp ---

test('formatTimestamp returns "No timestamp" for falsy input', () => {
  assert.equal(formatTimestamp(null), 'No timestamp');
  assert.equal(formatTimestamp(undefined), 'No timestamp');
  assert.equal(formatTimestamp(''), 'No timestamp');
});

test('formatTimestamp always includes time', () => {
  const date = new Date(2026, 0, 2, 15, 45);
  const result = formatTimestamp(date);
  assert.match(result, /PM/);
});

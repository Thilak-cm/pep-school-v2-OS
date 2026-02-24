import test from 'node:test';
import assert from 'node:assert/strict';

import { getIstIsoWeekKey, getIstMidnightDate } from './weekKey.js';

// --- getIstIsoWeekKey ---
// ISO 8601: Week starts Monday, week 1 contains Jan 4th (or first Thursday)

test('weekKey: known mid-year date', () => {
  // June 15, 2026 (Monday) → IST is UTC+5:30 so use a midday UTC time
  const date = new Date('2026-06-15T12:00:00Z');
  assert.equal(getIstIsoWeekKey(date), '2026-W25');
});

test('weekKey: Jan 1 2026 (Thursday) → week 1 of 2026', () => {
  const date = new Date('2026-01-01T12:00:00Z');
  assert.equal(getIstIsoWeekKey(date), '2026-W01');
});

test('weekKey: Dec 31 2026 (Thursday) → week 53 of 2026', () => {
  // 2026 has 53 weeks because Jan 1 is Thursday
  const date = new Date('2026-12-31T12:00:00Z');
  assert.equal(getIstIsoWeekKey(date), '2026-W53');
});

test('weekKey: Dec 31 2025 (Wednesday) → week 1 of 2026', () => {
  // Dec 31 2025 is a Wednesday. Since Jan 1 2026 is Thursday,
  // the week containing Thursday Jan 1 is week 1 of 2026.
  const date = new Date('2025-12-31T12:00:00Z');
  assert.equal(getIstIsoWeekKey(date), '2026-W01');
});

test('weekKey: IST midnight boundary — late UTC night is next day in IST', () => {
  // Jan 5 2026 23:00 UTC → Jan 6 2026 04:30 IST (next day)
  const lateUtc = new Date('2026-01-05T23:00:00Z');
  // Jan 6 is Tuesday of week 2
  assert.equal(getIstIsoWeekKey(lateUtc), '2026-W02');
});

test('weekKey: format is always YYYY-Wxx with zero-padded week', () => {
  const date = new Date('2026-01-05T12:00:00Z'); // week 2
  const key = getIstIsoWeekKey(date);
  assert.match(key, /^\d{4}-W\d{2}$/);
});

// --- getIstMidnightDate ---

test('getIstMidnightDate returns a midnight UTC date for IST day', () => {
  const date = new Date('2026-06-15T18:30:00Z'); // Jun 16 00:00 IST
  const midnight = getIstMidnightDate(date);
  assert.equal(midnight.getUTCHours(), 0);
  assert.equal(midnight.getUTCMinutes(), 0);
  // In IST this is Jun 16, so midnight should be Jun 16 UTC midnight
  assert.equal(midnight.getUTCDate(), 16);
});

test('getIstMidnightDate handles early UTC (same day in IST)', () => {
  const date = new Date('2026-06-15T06:00:00Z'); // Jun 15 11:30 IST
  const midnight = getIstMidnightDate(date);
  assert.equal(midnight.getUTCDate(), 15);
});

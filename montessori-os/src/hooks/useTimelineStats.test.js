/**
 * Tests for useTimelineStats pure helpers (#221 Sprint 2).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sumLast7Days, findStudentStats } from './timelineStatsHelpers.js';

describe('sumLast7Days', () => {
  it('sums the last 7 entries by date descending', () => {
    const daily = {
      '2026-07-20': 3,
      '2026-07-19': 5,
      '2026-07-18': 2,
      '2026-07-17': 4,
      '2026-07-16': 1,
      '2026-07-15': 6,
      '2026-07-14': 2,
      '2026-07-13': 10, // 8th entry, should be excluded
      '2026-07-12': 7,
    };
    assert.equal(sumLast7Days(daily), 3 + 5 + 2 + 4 + 1 + 6 + 2);
  });

  it('returns 0 for empty object', () => {
    assert.equal(sumLast7Days({}), 0);
  });

  it('returns 0 for null/undefined', () => {
    assert.equal(sumLast7Days(null), 0);
    assert.equal(sumLast7Days(undefined), 0);
  });

  it('handles fewer than 7 entries', () => {
    const daily = {
      '2026-07-20': 3,
      '2026-07-19': 5,
    };
    assert.equal(sumLast7Days(daily), 8);
  });
});

describe('findStudentStats', () => {
  const students = [
    { id: 's1', totalMentions: 10, thisWeekMentions: 3 },
    { id: 's2', totalMentions: 25, thisWeekMentions: 7 },
    { id: 's3', totalMentions: 5, thisWeekMentions: 0 },
  ];

  it('finds correct student by ID', () => {
    const result = findStudentStats(students, 's2');
    assert.equal(result.totalMentions, 25);
    assert.equal(result.thisWeekMentions, 7);
  });

  it('returns zeroes for unknown student', () => {
    const result = findStudentStats(students, 'unknown');
    assert.equal(result.totalMentions, 0);
    assert.equal(result.thisWeekMentions, 0);
  });

  it('returns zeroes for null students array', () => {
    const result = findStudentStats(null, 's1');
    assert.equal(result.totalMentions, 0);
    assert.equal(result.thisWeekMentions, 0);
  });

  it('returns zeroes for empty students array', () => {
    const result = findStudentStats([], 's1');
    assert.equal(result.totalMentions, 0);
    assert.equal(result.thisWeekMentions, 0);
  });
});

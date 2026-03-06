import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paginateTimelineItems } from './classroomTimelineUtils.js';

// Helper: create a fake Firestore-like timestamp
const ts = (dateStr) => {
  const d = new Date(dateStr);
  return { seconds: Math.floor(d.getTime() / 1000), toDate: () => d };
};

// Fixed "now" for deterministic time bucketing
const NOW = new Date('2026-03-06T12:00:00Z');

describe('paginateTimelineItems', () => {

  it('returns empty buckets for no items', () => {
    const result = paginateTimelineItems([], [], 10, NOW);
    assert.deepStrictEqual(result, { today: [], last7Days: [], beyond: [] });
  });

  it('includes ungrouped items even when grouped items exceed page size', () => {
    // 12 grouped items from a month ago, 2 ungrouped from today
    const grouped = Array.from({ length: 12 }, (_, i) => ({
      groupId: `g${i}`,
      notes: [{ id: `n${i}a`, studentId: `s1` }, { id: `n${i}b`, studentId: `s2` }],
      representativeNote: { id: `n${i}a`, type: 'lesson' },
      earliestObservedAt: new Date('2026-02-01'),
      studentIds: ['s1', 's2'],
      studentCount: 2,
    }));

    const ungrouped = [
      { id: 'voice1', type: 'voice', observedAt: ts('2026-03-06T10:00:00Z'), studentId: 's3' },
      { id: 'text1', type: 'text', observedAt: ts('2026-03-06T09:00:00Z'), studentId: 's4' },
    ];

    const result = paginateTimelineItems(grouped, ungrouped, 10, NOW);

    // Today's ungrouped items should appear — not be pushed out by old groups
    const todayIds = result.today.map(item => item.id || item.groupId);
    assert.ok(todayIds.includes('voice1'), 'voice1 should appear in today');
    assert.ok(todayIds.includes('text1'), 'text1 should appear in today');
  });

  it('sorts merged items by date (newest first) before paginating', () => {
    const grouped = [{
      groupId: 'g1',
      notes: [{ id: 'n1a', studentId: 's1' }, { id: 'n1b', studentId: 's2' }],
      representativeNote: { id: 'n1a', type: 'lesson' },
      earliestObservedAt: new Date('2026-03-05T08:00:00Z'), // yesterday
      studentIds: ['s1', 's2'],
      studentCount: 2,
    }];

    const ungrouped = [
      { id: 'voice1', type: 'voice', observedAt: ts('2026-03-06T10:00:00Z'), studentId: 's3' }, // today
      { id: 'text1', type: 'text', observedAt: ts('2026-03-04T10:00:00Z'), studentId: 's4' },   // 2 days ago
    ];

    const result = paginateTimelineItems(grouped, ungrouped, 10, NOW);

    // voice1 (today) should be in today bucket
    assert.ok(result.today.some(i => i.id === 'voice1'));
    // g1 (yesterday) should be in last7Days
    assert.ok(result.last7Days.some(i => i.groupId === 'g1'));
    // text1 (2 days ago) should be in last7Days
    assert.ok(result.last7Days.some(i => i.id === 'text1'));
  });

  it('respects displayedNotesCount limit on merged list', () => {
    const grouped = Array.from({ length: 5 }, (_, i) => ({
      groupId: `g${i}`,
      notes: [{ id: `n${i}`, studentId: 's1' }],
      representativeNote: { id: `n${i}`, type: 'lesson' },
      earliestObservedAt: new Date(`2026-02-${10 + i}T10:00:00Z`),
      studentIds: ['s1'],
      studentCount: 1,
    }));

    const ungrouped = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      type: 'voice',
      observedAt: ts(`2026-02-${20 + i}T10:00:00Z`),
      studentId: `s${i}`,
    }));

    // 13 total items, limit to 7
    const result = paginateTimelineItems(grouped, ungrouped, 7, NOW);

    const totalRendered =
      result.today.length + result.last7Days.length + result.beyond.length;
    assert.equal(totalRendered, 7);
  });

  it('marks grouped items with isGrouped=true and ungrouped with isGrouped=false', () => {
    const grouped = [{
      groupId: 'g1',
      notes: [{ id: 'n1', studentId: 's1' }, { id: 'n2', studentId: 's2' }],
      representativeNote: { id: 'n1', type: 'lesson' },
      earliestObservedAt: new Date('2026-03-06T08:00:00Z'),
      studentIds: ['s1', 's2'],
      studentCount: 2,
    }];
    const ungrouped = [
      { id: 'v1', type: 'voice', observedAt: ts('2026-03-06T10:00:00Z'), studentId: 's3' },
    ];

    const result = paginateTimelineItems(grouped, ungrouped, 10, NOW);

    const allItems = [...result.today, ...result.last7Days, ...result.beyond];
    const groupedItem = allItems.find(i => i.groupId === 'g1');
    const ungroupedItem = allItems.find(i => i.id === 'v1');

    assert.equal(groupedItem.isGrouped, true);
    assert.equal(ungroupedItem.isGrouped, false);
  });

  it('handles observations with only timestamp field (no observedAt)', () => {
    // Use a time very close to NOW to avoid timezone edge cases
    const ungrouped = [
      { id: 'old1', type: 'text', timestamp: ts('2026-03-06T11:00:00Z'), studentId: 's1' },
    ];

    const result = paginateTimelineItems([], ungrouped, 10, NOW);
    assert.equal(result.today.length, 1);
    assert.equal(result.today[0].id, 'old1');
  });

  it('handles all items in a single time bucket', () => {
    const ungrouped = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      type: 'text',
      observedAt: ts(`2026-03-06T${10 + i}:00:00Z`),
      studentId: `s${i}`,
    }));

    const result = paginateTimelineItems([], ungrouped, 10, NOW);
    assert.equal(result.today.length, 3);
    assert.equal(result.last7Days.length, 0);
    assert.equal(result.beyond.length, 0);
  });
});

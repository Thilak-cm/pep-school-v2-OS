import test from 'node:test';
import assert from 'node:assert/strict';

import { filterObservationsForExport } from './export.js';

// --- Date boundary edge cases for filterObservationsForExport ---

test('dateFilter: end date is inclusive — observation at 2PM on end date is included', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 6, 14, 0, 0) } // Mar 6 2PM
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: end date boundary — observation at 11:59:59 PM on end date is included', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 6, 23, 59, 59) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: start date is inclusive — observation at 12:01 AM on start date is included', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 1, 0, 1, 0) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: observation before start date is excluded', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 1, 28, 23, 59, 59) } // Feb 28
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 0);
});

test('dateFilter: observation after end date is excluded', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 7, 0, 0, 1) } // Mar 7 00:00:01
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 0);
});

test('dateFilter: Firestore {seconds} timestamp at 2PM on end date is included', () => {
  // Mar 6, 2026 14:00:00 UTC in epoch seconds
  const mar6_2pm = Math.floor(new Date(2026, 2, 6, 14, 0, 0).getTime() / 1000);
  const obs = [
    { type: 'text', observedAt: { seconds: mar6_2pm } }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: observation with only timestamp (no observedAt) is date-filtered correctly', () => {
  const obs = [
    { type: 'text', timestamp: new Date(2026, 2, 3, 10, 0, 0) } // in range
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: observation with only timestamp outside range is excluded', () => {
  const obs = [
    { type: 'text', timestamp: new Date(2026, 2, 10, 10, 0, 0) } // Mar 10 — after range
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 0);
});

test('dateFilter: observation at exactly midnight on start date is included', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 1, 0, 0, 0) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-03-01', to: '2026-03-06' }
  });
  assert.equal(result.length, 1);
});

test('dateFilter: Date object end date is inclusive (whole day)', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 2, 6, 18, 30, 0) } // 6:30 PM
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: new Date(2026, 2, 1), to: new Date(2026, 2, 6) }
  });
  assert.equal(result.length, 1);
});

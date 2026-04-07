import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupReportsByDate } from './reportTimelineUtils.js';

describe('groupReportsByDate', () => {
  it('groups reports by calendar date', () => {
    const reports = [
      { id: 'r1', generatedAt: new Date('2026-04-03T10:00:00Z'), studentId: 's1', studentName: 'Maya' },
      { id: 'r2', generatedAt: new Date('2026-04-03T14:00:00Z'), studentId: 's2', studentName: 'Arjun' },
      { id: 'r3', generatedAt: new Date('2026-04-05T09:00:00Z'), studentId: 's3', studentName: 'Sofia' },
    ];
    const groups = groupReportsByDate(reports);
    assert.equal(groups.length, 2);
    // Newest date first
    assert.equal(groups[0].reports.length, 1); // Apr 5
    assert.equal(groups[1].reports.length, 2); // Apr 3
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(groupReportsByDate([]), []);
    assert.deepEqual(groupReportsByDate(null), []);
    assert.deepEqual(groupReportsByDate(undefined), []);
  });

  it('sorts groups by date descending (newest first)', () => {
    const reports = [
      { id: 'r1', generatedAt: new Date('2026-03-01T10:00:00Z'), studentId: 's1', studentName: 'A' },
      { id: 'r2', generatedAt: new Date('2026-04-01T10:00:00Z'), studentId: 's2', studentName: 'B' },
    ];
    const groups = groupReportsByDate(reports);
    assert.equal(groups.length, 2);
    assert.ok(groups[0].date > groups[1].date);
  });

  it('handles Firestore Timestamp-like objects with toDate()', () => {
    const reports = [
      { id: 'r1', generatedAt: { toDate: () => new Date('2026-04-03T10:00:00Z') }, studentId: 's1', studentName: 'Maya' },
    ];
    const groups = groupReportsByDate(reports);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reports.length, 1);
  });

  it('each group has a date, dateLabel, and reports array', () => {
    const reports = [
      { id: 'r1', generatedAt: new Date('2026-04-03T10:00:00Z'), studentId: 's1', studentName: 'Maya' },
    ];
    const groups = groupReportsByDate(reports);
    assert.equal(groups.length, 1);
    assert.ok(groups[0].date instanceof Date);
    assert.equal(typeof groups[0].dateLabel, 'string');
    assert.ok(Array.isArray(groups[0].reports));
  });

  it('preserves all report fields within each group', () => {
    const reports = [
      { id: 'r1', generatedAt: new Date('2026-04-03T10:00:00Z'), studentId: 's1', studentName: 'Maya', noteCount: 12, reportText: 'Some text' },
    ];
    const groups = groupReportsByDate(reports);
    const report = groups[0].reports[0];
    assert.equal(report.id, 'r1');
    assert.equal(report.studentId, 's1');
    assert.equal(report.studentName, 'Maya');
    assert.equal(report.noteCount, 12);
    assert.equal(report.reportText, 'Some text');
  });
});

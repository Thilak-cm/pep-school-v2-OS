import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTE_KIND,
  generateExportMetadata,
  generateSummary,
  filterObservationsForExport,
  generateFilename,
  cleanObservationData,
  formatTimestampForText
} from './export.js';

// --- generateSummary ---

test('generateSummary: empty array returns zeroed summary', () => {
  const result = generateSummary([]);
  assert.equal(result.totalObservations, 0);
  assert.equal(result.voiceNotes, 0);
  assert.equal(result.textNotes, 0);
  assert.equal(result.starredNotes, 0);
  assert.equal(result.dateRange.earliest, null);
  assert.equal(result.dateRange.latest, null);
});

test('generateSummary: null input returns zeroed summary', () => {
  const result = generateSummary(null);
  assert.equal(result.totalObservations, 0);
});

test('generateSummary: counts by type', () => {
  const obs = [
    { type: 'voice', timestamp: new Date() },
    { type: 'voice', timestamp: new Date() },
    { type: 'text', timestamp: new Date() },
    { type: 'lesson', timestamp: new Date() } // neither voice nor text
  ];
  const result = generateSummary(obs);
  assert.equal(result.totalObservations, 4);
  assert.equal(result.voiceNotes, 2);
  assert.equal(result.textNotes, 1);
});

test('generateSummary: counts starred (by starScore)', () => {
  const obs = [
    { type: 'text', starScore: 5, timestamp: new Date() },
    { type: 'text', starScore: 0, timestamp: new Date() }, // 0 is finite → starred
    { type: 'text', timestamp: new Date() } // no starScore → not starred
  ];
  const result = generateSummary(obs);
  assert.equal(result.starredNotes, 2);
});

test('generateSummary: date range picks earliest and latest', () => {
  const jan = new Date(2026, 0, 15);
  const mar = new Date(2026, 2, 20);
  const jun = new Date(2026, 5, 10);
  const obs = [
    { type: 'text', observedAt: mar },
    { type: 'text', observedAt: jan },
    { type: 'text', observedAt: jun }
  ];
  const result = generateSummary(obs);
  assert.ok(result.dateRange.earliest.includes('2026-01'));
  assert.ok(result.dateRange.latest.includes('2026-06'));
});

test('generateSummary: handles Firestore {seconds} timestamps', () => {
  const obs = [
    { type: 'text', timestamp: { seconds: 1704067200 } }, // Jan 1, 2024
    { type: 'text', timestamp: { seconds: 1706745600 } }  // Feb 1, 2024
  ];
  const result = generateSummary(obs);
  assert.ok(result.dateRange.earliest !== null);
  assert.ok(result.dateRange.latest !== null);
});

// --- filterObservationsForExport ---

test('filterObservations: no filters → returns all', () => {
  const obs = [
    { type: 'text', observedAt: new Date() },
    { type: 'lesson', observedAt: new Date() }
  ];
  const result = filterObservationsForExport({ observations: obs });
  assert.equal(result.length, 2);
});

test('filterObservations: filter by lesson only', () => {
  const obs = [
    { type: 'text', observedAt: new Date() },
    { type: 'voice', observedAt: new Date() },
    { type: 'lesson', observedAt: new Date() }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    noteKinds: [NOTE_KIND.LESSON]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'lesson');
});

test('filterObservations: filter by observation (text + voice, not lesson)', () => {
  const obs = [
    { type: 'text', observedAt: new Date() },
    { type: 'voice', observedAt: new Date() },
    { type: 'lesson', observedAt: new Date() }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    noteKinds: [NOTE_KIND.OBSERVATION]
  });
  assert.equal(result.length, 2); // text + voice
});

test('filterObservations: filter by date range', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 0, 10) },
    { type: 'text', observedAt: new Date(2026, 0, 20) },
    { type: 'text', observedAt: new Date(2026, 0, 30) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-01-15', to: '2026-01-25' }
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].observedAt.getDate(), 20);
});

test('filterObservations: dateRange accepts start/end aliases', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 0, 10) },
    { type: 'text', observedAt: new Date(2026, 0, 20) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { start: '2026-01-15', end: '2026-01-25' }
  });
  assert.equal(result.length, 1);
});

test('filterObservations: combines kind + date filters', () => {
  const obs = [
    { type: 'text', observedAt: new Date(2026, 0, 10) },
    { type: 'lesson', observedAt: new Date(2026, 0, 20) },
    { type: 'text', observedAt: new Date(2026, 0, 20) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    noteKinds: [NOTE_KIND.OBSERVATION],
    dateRange: { from: '2026-01-15' }
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'text');
});

test('filterObservations: empty input returns empty', () => {
  assert.deepEqual(filterObservationsForExport({ observations: [] }), []);
  assert.deepEqual(filterObservationsForExport(), []);
});

test('filterObservations: skips obs with no timestamp when date filter active', () => {
  const obs = [
    { type: 'text' }, // no timestamp at all
    { type: 'text', observedAt: new Date(2026, 0, 20) }
  ];
  const result = filterObservationsForExport({
    observations: obs,
    dateRange: { from: '2026-01-01' }
  });
  assert.equal(result.length, 1);
});

// --- generateFilename ---

test('generateFilename: basic filename', () => {
  const name = generateFilename({ subjectName: 'Aarav', observationCount: 10, format: 'json' });
  assert.match(name, /^Aarav_10_Notes_\d{4}-\d{2}-\d{2}\.json$/);
});

test('generateFilename: txt format', () => {
  const name = generateFilename({ subjectName: 'Test', format: 'txt' });
  assert.ok(name.endsWith('.txt'));
});

test('generateFilename: strips special characters from subject name', () => {
  const name = generateFilename({ subjectName: 'Aarav (K.)' });
  // Only check the name portion before the extension
  const nameWithoutExt = name.replace(/\.\w+$/, '');
  assert.ok(!nameWithoutExt.includes('('));
  assert.ok(!nameWithoutExt.includes(')'));
  assert.ok(!nameWithoutExt.includes('.'));
});

test('generateFilename: replaces spaces with underscores', () => {
  const name = generateFilename({ subjectName: 'Aarav Kumar' });
  assert.match(name, /Aarav_Kumar/);
});

test('generateFilename: includes segments (underscores stripped, spaces become _)', () => {
  const name = generateFilename({
    subjectName: 'Aarav',
    segments: ['Lesson Notes'],
    observationCount: 5,
    format: 'txt'
  });
  assert.match(name, /Aarav_Lesson_Notes_5_Notes/);
});

test('generateFilename: defaults to "Observations" for empty subject', () => {
  const name = generateFilename({ subjectName: '' });
  assert.match(name, /^Observations_/);
});

// --- cleanObservationData ---

test('cleanObservationData: normalizes all fields with defaults', () => {
  const cleaned = cleanObservationData({});
  assert.equal(cleaned.id, '');
  assert.equal(cleaned.text, '');
  assert.equal(cleaned.type, '');
  assert.equal(cleaned.createdBy, '');
  assert.equal(cleaned.durationSec, null);
  assert.equal(cleaned.starScore, null);
});

test('cleanObservationData: preserves actual values', () => {
  const obs = { id: 'obs-1', text: 'Hello world', type: 'voice', durationSec: 30 };
  const cleaned = cleanObservationData(obs);
  assert.equal(cleaned.id, 'obs-1');
  assert.equal(cleaned.text, 'Hello world');
  assert.equal(cleaned.type, 'voice');
  assert.equal(cleaned.durationSec, 30);
});

test('cleanObservationData: falls back duration to "duration" field', () => {
  const cleaned = cleanObservationData({ duration: 45 });
  assert.equal(cleaned.durationSec, 45);
});

test('cleanObservationData: falls back lessonTitle to "title"', () => {
  const cleaned = cleanObservationData({ title: 'My Lesson' });
  assert.equal(cleaned.lessonTitle, 'My Lesson');
});

test('cleanObservationData: falls back ratings to dimensionRatings', () => {
  const cleaned = cleanObservationData({ dimensionRatings: { A: 'yes' } });
  assert.deepEqual(cleaned.ratings, { A: 'yes' });
});

// --- formatTimestampForText ---

test('formatTimestampForText: "No timestamp" for falsy', () => {
  assert.equal(formatTimestampForText(null), 'No timestamp');
  assert.equal(formatTimestampForText(undefined), 'No timestamp');
});

test('formatTimestampForText: formats Firestore {seconds}', () => {
  const result = formatTimestampForText({ seconds: 1704067200 });
  assert.match(result, /\|/); // contains separator
  assert.match(result, /[AP]M/); // contains AM/PM
});

test('formatTimestampForText: formats Date object', () => {
  const result = formatTimestampForText(new Date(2026, 0, 15, 14, 0));
  assert.match(result, /January/);
  assert.match(result, /2PM/);
});

test('formatTimestampForText: "Invalid timestamp" for unknown types', () => {
  assert.equal(formatTimestampForText('string-timestamp'), 'Invalid timestamp');
  assert.equal(formatTimestampForText(12345), 'Invalid timestamp');
});

// --- generateExportMetadata ---

test('generateExportMetadata: includes all fields', () => {
  const meta = generateExportMetadata({ email: 'test@pep.school' }, 'test_export', '2.0');
  assert.equal(meta.exportedBy, 'test@pep.school');
  assert.equal(meta.exportType, 'test_export');
  assert.equal(meta.version, '2.0');
  assert.ok(meta.exportedAt); // ISO string
});

test('generateExportMetadata: falls back exportedBy to displayName', () => {
  const meta = generateExportMetadata({ displayName: 'Test User' });
  assert.equal(meta.exportedBy, 'Test User');
});

test('generateExportMetadata: defaults to "Unknown User"', () => {
  const meta = generateExportMetadata({});
  assert.equal(meta.exportedBy, 'Unknown User');
});

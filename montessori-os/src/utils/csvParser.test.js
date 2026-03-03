import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCSV,
  validateCSV,
  extractUniqueNames,
  applyDefaultDate,
  normalizeDateDMY,
  DEFAULT_PLACEHOLDER_DATE,
} from './csvParser.js';

// --- parseCSV ---

test('parseCSV parses valid CSV with headers', () => {
  const csv = `type,student_name,date,content
lesson,Aarav Kumar,15-01-2026,Introduction to Fractions
observation,Priya Sharma,16-01-2026,Worked independently on bead material`;
  const { rows, errors } = parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'lesson');
  assert.equal(rows[0].student_name, 'Aarav Kumar');
  assert.equal(rows[0].date, '15-01-2026');
  assert.equal(rows[0].content, 'Introduction to Fractions');
  assert.equal(rows[1].type, 'observation');
  assert.equal(errors.length, 0);
});

test('parseCSV trims whitespace from all fields', () => {
  const csv = `type,student_name,date,content
  lesson , Aarav Kumar , 15-01-2026 , Intro to Fractions `;
  const { rows } = parseCSV(csv);
  assert.equal(rows[0].type, 'lesson');
  assert.equal(rows[0].student_name, 'Aarav Kumar');
  assert.equal(rows[0].date, '15-01-2026');
  assert.equal(rows[0].content, 'Intro to Fractions');
});

test('parseCSV skips empty rows', () => {
  const csv = `type,student_name,date,content
lesson,Aarav,15-01-2026,Fractions

observation,Priya,16-01-2026,Bead work
`;
  const { rows } = parseCSV(csv);
  assert.equal(rows.length, 2);
});

test('parseCSV handles quoted fields with commas', () => {
  const csv = `type,student_name,date,content
observation,Aarav Kumar,15-01-2026,"Worked on fractions, multiplication, and division"`;
  const { rows } = parseCSV(csv);
  assert.equal(rows[0].content, 'Worked on fractions, multiplication, and division');
});

test('parseCSV returns errors for malformed CSV', () => {
  const csv = '';
  const { rows, errors } = parseCSV(csv);
  assert.equal(rows.length, 0);
  assert.ok(errors.length > 0);
});

test('parseCSV normalizes type column to lowercase', () => {
  const csv = `type,student_name,date,content
Lesson,Aarav,15-01-2026,Fractions
OBSERVATION,Priya,16-01-2026,Bead work`;
  const { rows } = parseCSV(csv);
  assert.equal(rows[0].type, 'lesson');
  assert.equal(rows[1].type, 'observation');
});

// --- validateCSV ---

test('validateCSV accepts valid rows', () => {
  const rows = [
    { type: 'lesson', student_name: 'Aarav', date: '15-01-2026', content: 'Fractions' },
    { type: 'observation', student_name: 'Priya', date: '16-01-2026', content: 'Bead work' },
  ];
  const { valid, errors } = validateCSV(rows);
  assert.equal(valid, true);
  assert.equal(errors.length, 0);
});

test('validateCSV rejects rows with missing required columns', () => {
  const rows = [
    { type: 'lesson', student_name: 'Aarav' }, // missing date and content
  ];
  const { valid, errors } = validateCSV(rows);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('validateCSV rejects rows with invalid type', () => {
  const rows = [
    { type: 'video', student_name: 'Aarav', date: '15-01-2026', content: 'Something' },
  ];
  const { valid, errors } = validateCSV(rows);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('type')));
});

test('validateCSV rejects rows with missing student_name', () => {
  const rows = [
    { type: 'lesson', student_name: '', date: '15-01-2026', content: 'Fractions' },
  ];
  const { valid, errors } = validateCSV(rows);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('student_name')));
});

test('validateCSV rejects rows with missing content', () => {
  const rows = [
    { type: 'observation', student_name: 'Aarav', date: '15-01-2026', content: '' },
  ];
  const { valid, errors } = validateCSV(rows);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('content')));
});

test('validateCSV allows missing date (will be filled by applyDefaultDate)', () => {
  const rows = [
    { type: 'lesson', student_name: 'Aarav', date: '', content: 'Fractions' },
  ];
  const { valid } = validateCSV(rows);
  assert.equal(valid, true);
});

// --- extractUniqueNames ---

test('extractUniqueNames returns deduplicated names', () => {
  const rows = [
    { student_name: 'Aarav Kumar' },
    { student_name: 'Priya Sharma' },
    { student_name: 'Aarav Kumar' },
    { student_name: 'priya sharma' },
  ];
  const names = extractUniqueNames(rows);
  // Case-insensitive dedup
  assert.equal(names.length, 2);
});

test('extractUniqueNames preserves original casing of first occurrence', () => {
  const rows = [
    { student_name: 'Aarav Kumar' },
    { student_name: 'aarav kumar' },
  ];
  const names = extractUniqueNames(rows);
  assert.equal(names[0], 'Aarav Kumar');
});

test('extractUniqueNames returns empty array for empty input', () => {
  const names = extractUniqueNames([]);
  assert.equal(names.length, 0);
});

// --- normalizeDateDMY ---

test('normalizeDateDMY converts DD-MM-YYYY to YYYY-MM-DD', () => {
  assert.equal(normalizeDateDMY('15-01-2026'), '2026-01-15');
  assert.equal(normalizeDateDMY('03-12-2025'), '2025-12-03');
  assert.equal(normalizeDateDMY('1-2-2026'), '2026-02-01');
});

test('normalizeDateDMY passes through ISO dates unchanged', () => {
  assert.equal(normalizeDateDMY('2026-01-15'), '2026-01-15');
});

test('normalizeDateDMY returns empty string for empty input', () => {
  assert.equal(normalizeDateDMY(''), '');
  assert.equal(normalizeDateDMY(null), '');
  assert.equal(normalizeDateDMY(undefined), '');
});

// --- applyDefaultDate ---

test('applyDefaultDate fills missing dates with placeholder', () => {
  const rows = [
    { type: 'lesson', student_name: 'Aarav', date: '', content: 'Fractions' },
    { type: 'observation', student_name: 'Priya', date: '16-01-2026', content: 'Bead work' },
  ];
  const result = applyDefaultDate(rows);
  assert.equal(result[0].date, DEFAULT_PLACEHOLDER_DATE);
  assert.equal(result[1].date, '2026-01-16');
});

test('applyDefaultDate normalizes DD-MM-YYYY to ISO', () => {
  const rows = [
    { type: 'lesson', student_name: 'Aarav', date: '01-02-2026', content: 'Algebra' },
  ];
  const result = applyDefaultDate(rows);
  assert.equal(result[0].date, '2026-02-01');
});

test('DEFAULT_PLACEHOLDER_DATE is January 10, 2026', () => {
  assert.equal(DEFAULT_PLACEHOLDER_DATE, '2026-01-10');
});

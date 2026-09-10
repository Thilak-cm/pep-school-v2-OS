import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  matchStudentNames,
  normalizeName,
  filterStudentPool,
  buildObservationDoc,
  buildLessonDoc,
  checkDuplicates,
  ZONE,
  JW_AUTO,
  JW_REVIEW_FLOOR,
  JW_MARGIN,
  JW_SUGGEST_FLOOR,
} from './BulkUploadPage.helpers.js';

// --- matchStudentNames (tiered engine, #285) ---

const STUDENTS = [
  { id: 's1', displayName: 'Aarav Kumar', firstName: 'Aarav', lastName: 'Kumar', classroomId: 'c1' },
  { id: 's2', displayName: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma', classroomId: 'c1' },
  { id: 's3', displayName: 'Arjun Patel', firstName: 'Arjun', lastName: 'Patel', classroomId: 'c2' },
  { id: 's4', displayName: 'Meera Gupta', firstName: 'Meera', lastName: 'Gupta', classroomId: 'c2' },
];

test('exported zone thresholds match the specced constants', () => {
  assert.equal(JW_AUTO, 0.95);
  assert.equal(JW_REVIEW_FLOOR, 0.85);
  assert.equal(JW_MARGIN, 0.05);
  assert.equal(JW_SUGGEST_FLOOR, 0.70);
  assert.deepEqual(ZONE, { AUTO: 'auto', REVIEW: 'review', NONE: 'none' });
});

// -- normalization --

test('normalizeName trims, lowercases, collapses whitespace, strips punctuation', () => {
  assert.equal(normalizeName('  Aarav   KUMAR. '), 'aarav kumar');
});

test('normalizeName strips diacritics', () => {
  assert.equal(normalizeName('Aärav Kúmar'), 'aarav kumar');
});

test('normalizeName strips leading honorifics', () => {
  assert.equal(normalizeName('Master Aarav Kumar'), 'aarav kumar');
  assert.equal(normalizeName('Baby Priya'), 'priya');
  assert.equal(normalizeName('Ms. Meera Gupta'), 'meera gupta');
});

test('empty student pool returns none zone for every source name', () => {
  const results = matchStudentNames(['Aarav Kumar'], []);
  assert.equal(results.length, 1);
  assert.equal(results[0].zone, ZONE.NONE);
  assert.equal(results[0].match, null);
  assert.equal(results[0].candidates.length, 0);
});

// -- tier 1: exact full name --

test('exact full-name match is auto zone via exact-full tier', () => {
  const results = matchStudentNames(['Aarav Kumar'], STUDENTS);
  assert.equal(results.length, 1);
  assert.equal(results[0].csvName, 'Aarav Kumar');
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].zone, ZONE.AUTO);
  assert.equal(results[0].tier, 'exact-full');
});

test('exact full-name match survives noisy formatting and honorifics', () => {
  const results = matchStudentNames(['  MASTER Aärav   Kumar. '], STUDENTS);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].zone, ZONE.AUTO);
});

test('exact full-name match is word-order insensitive (token sort)', () => {
  const results = matchStudentNames(['Kumar Aarav'], STUDENTS);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].zone, ZONE.AUTO);
  assert.equal(results[0].tier, 'exact-full');
});

test('duplicate full names in pool do not auto-match; both surface as review candidates', () => {
  const results = matchStudentNames(['Aarav Kumar'], [
    ...STUDENTS,
    { id: 'dup', displayName: 'Aarav Kumar', firstName: 'Aarav', lastName: 'Kumar', classroomId: 'c2' },
  ]);
  assert.equal(results[0].zone, ZONE.REVIEW);
  assert.ok(results[0].match, 'review zone still pre-selects a best candidate');
  assert.equal(results[0].candidates.length >= 2, true);
  const ids = results[0].candidates.map((c) => c.id);
  assert.ok(ids.includes('s1') && ids.includes('dup'));
});

// -- tier 2: exact first name --

test('single-token exact-unique firstName is auto zone via exact-first tier', () => {
  const results = matchStudentNames(['Priya'], STUDENTS);
  assert.equal(results[0].match.id, 's2');
  assert.equal(results[0].zone, ZONE.AUTO);
  assert.equal(results[0].tier, 'exact-first');
});

test('single-token exact non-unique firstName is review zone with exactly those candidates', () => {
  const pool = [
    ...STUDENTS,
    { id: 's5', displayName: 'Aarav Mehta', firstName: 'Aarav', lastName: 'Mehta', classroomId: 'c2' },
  ];
  const results = matchStudentNames(['Aarav'], pool);
  assert.equal(results[0].zone, ZONE.REVIEW);
  assert.equal(results[0].tier, 'ambiguous-first');
  assert.ok(results[0].match, 'best candidate is pre-selected');
  const ids = results[0].candidates.map((c) => c.id).sort();
  assert.deepEqual(ids, ['s1', 's5']);
});

// -- tier 3: fuzzy (Jaro-Winkler) --

test('close typo lands in auto zone via fuzzy tier', () => {
  // JW('aarav kumr','aarav kumar') = 0.982 >= 0.95, runner-up far below
  const results = matchStudentNames(['Aarav Kumr'], STUDENTS);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].zone, ZONE.AUTO);
  assert.equal(results[0].tier, 'fuzzy');
});

test('mid-band typo lands in review zone', () => {
  // JW('meer gpta','meera gupta') = 0.908 -> [0.85, 0.95)
  const results = matchStudentNames(['Meer Gpta'], STUDENTS);
  assert.equal(results[0].zone, ZONE.REVIEW);
  assert.equal(results[0].match.id, 's4');
});

test('single-token fuzzy compares against firstName (romanization variant)', () => {
  // JW('dipika','deepika') = 0.864 -> review band
  const pool = [...STUDENTS, { id: 's6', displayName: 'Deepika Rao', firstName: 'Deepika', lastName: 'Rao', classroomId: 'c1' }];
  const results = matchStudentNames(['Dipika'], pool);
  assert.equal(results[0].zone, ZONE.REVIEW);
  assert.equal(results[0].match.id, 's6');
});

test('high score with thin margin over runner-up is review zone, not auto', () => {
  // JW('aarav kumas', 'aarav kumar') = JW('aarav kumas', 'aarav kumat') = 0.964; margin 0 < 0.05
  const pool = [
    ...STUDENTS,
    { id: 's7', displayName: 'Aarav Kumat', firstName: 'Aarav', lastName: 'Kumat', classroomId: 'c2' },
  ];
  const results = matchStudentNames(['Aarav Kumas'], pool);
  assert.equal(results[0].zone, ZONE.REVIEW);
  const ids = results[0].candidates.map((c) => c.id);
  assert.ok(ids.includes('s1') && ids.includes('s7'));
});

test('unrecognizable name is none zone with no candidates', () => {
  // JW('zara williams', best pool entry) < 0.60
  const results = matchStudentNames(['Zara Williams'], STUDENTS);
  assert.equal(results[0].zone, ZONE.NONE);
  assert.equal(results[0].match, null);
  assert.equal(results[0].candidates.length, 0);
});

test('below-review-floor name is none zone but surfaces weak suggestions', () => {
  // JW('prea','priya') = 0.827 -> below 0.85 floor, above 0.70 suggest floor
  const results = matchStudentNames(['Prea'], STUDENTS);
  assert.equal(results[0].zone, ZONE.NONE);
  assert.equal(results[0].match, null);
  const ids = results[0].candidates.map((c) => c.id);
  assert.ok(ids.includes('s2'), 'Priya surfaced as a suggestion');
});

// -- pool filtering invariants --

test('inactive students are never candidates', () => {
  const results = matchStudentNames(['Aarav Kumar'], [
    { id: 'inactive', displayName: 'Aarav Kumar', firstName: 'Aarav', lastName: 'Kumar', classroomId: 'c9', status: 'inactive' },
    ...STUDENTS,
  ]);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].zone, ZONE.AUTO);
});

test('inactive students stay out after classroom filtering', () => {
  const results = matchStudentNames(['Aarav Kumar'], [
    { id: 'inactive', displayName: 'Aarav Kumar', firstName: 'Aarav', lastName: 'Kumar', classroomId: 'c1', status: 'inactive' },
    ...STUDENTS,
  ], { programClassroomIds: ['c1'] });
  assert.equal(results[0].match.id, 's1');
});

test('classroomId filter excludes other classrooms', () => {
  const results = matchStudentNames(['Arjun Patel'], STUDENTS, { classroomId: 'c1' });
  assert.equal(results[0].zone, ZONE.NONE);
  assert.equal(results[0].match, null);
});

test('programClassroomIds filter matches across selected classrooms', () => {
  const results = matchStudentNames(
    ['Aarav Kumar', 'Arjun Patel'],
    STUDENTS,
    { programClassroomIds: ['c1', 'c2'] },
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[1].match.id, 's3');
  assert.equal(results[0].zone, ZONE.AUTO);
  assert.equal(results[1].zone, ZONE.AUTO);
});

test('programClassroomIds filter excludes unselected classrooms', () => {
  const results = matchStudentNames(['Arjun Patel'], STUDENTS, { programClassroomIds: ['c1'] });
  assert.equal(results[0].zone, ZONE.NONE);
});

test('multiple names each get an independent result', () => {
  const results = matchStudentNames(['Aarav Kumar', 'Priya Sharma', 'Unknown Person'], STUDENTS);
  assert.equal(results.length, 3);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[1].match.id, 's2');
  assert.equal(results[2].zone, ZONE.NONE);
});

// -- filterStudentPool (shared with picker default scope) --

test('filterStudentPool drops non-active students and applies classroom filters', () => {
  const pool = [
    { id: 'a', classroomId: 'c1' },
    { id: 'b', classroomId: 'c2', status: 'active' },
    { id: 'c', classroomId: 'c1', status: 'inactive' },
  ];
  assert.deepEqual(filterStudentPool(pool, {}).map((s) => s.id), ['a', 'b']);
  assert.deepEqual(filterStudentPool(pool, { classroomId: 'c1' }).map((s) => s.id), ['a']);
  assert.deepEqual(filterStudentPool(pool, { programClassroomIds: ['c2'] }).map((s) => s.id), ['b']);
});

// --- buildObservationDoc ---

const MOCK_USER = {
  uid: 'admin1',
  displayName: 'Admin User',
  email: 'admin@pep.com',
};

test('buildObservationDoc creates correct text observation structure', () => {
  const doc = buildObservationDoc({
    studentId: 's1',
    classroomId: 'c1',
    branchId: 'b1',
    text: 'Worked independently on bead material',
    date: '2026-01-15',
    currentUser: MOCK_USER,
    groupId: 'grp_123',
  });
  assert.equal(doc.studentId, 's1');
  assert.equal(doc.classroomId, 'c1');
  assert.equal(doc.branchId, 'b1');
  assert.equal(doc.type, 'text');
  assert.equal(doc.text, 'Worked independently on bead material');
  assert.equal(doc.createdBy, 'admin1');
  assert.equal(doc.createdByName, 'Admin User');
  assert.equal(doc.createdByEmail, 'admin@pep.com');
  assert.ok(doc.observedAt instanceof Date);
  assert.equal(doc.groupId, 'grp_123');
});

test('buildObservationDoc parses date string to Date object', () => {
  const doc = buildObservationDoc({
    studentId: 's1',
    classroomId: 'c1',
    branchId: 'b1',
    text: 'Note text',
    date: '2026-01-15',
    currentUser: MOCK_USER,
  });
  assert.equal(doc.observedAt.getFullYear(), 2026);
  assert.equal(doc.observedAt.getMonth(), 0); // January
  assert.equal(doc.observedAt.getDate(), 15);
});

// --- buildLessonDoc ---

test('buildLessonDoc creates correct lesson observation structure', () => {
  const doc = buildLessonDoc({
    studentId: 's1',
    classroomId: 'c1',
    branchId: 'b1',
    programId: 'primary',
    lessonTitle: 'Introduction to Fractions',
    date: '2026-01-15',
    currentUser: MOCK_USER,
    groupId: 'grp_456',
  });
  assert.equal(doc.studentId, 's1');
  assert.equal(doc.classroomId, 'c1');
  assert.equal(doc.type, 'lesson');
  assert.equal(doc.lessonTitle, 'Introduction to Fractions');
  assert.equal(doc.programId, 'primary');
  assert.equal(doc.createdBy, 'admin1');
  assert.ok(doc.observedAt instanceof Date);
  assert.equal(doc.groupId, 'grp_456');
});

test('buildLessonDoc sets attendanceStatus to present', () => {
  const doc = buildLessonDoc({
    studentId: 's1',
    classroomId: 'c1',
    branchId: 'b1',
    programId: 'primary',
    lessonTitle: 'Algebra',
    date: '2026-02-01',
    currentUser: MOCK_USER,
  });
  assert.equal(doc.attendanceStatus, 'present');
});

// --- checkDuplicates ---

test('checkDuplicates flags rows matching existing observations', () => {
  const rows = [
    { studentId: 's1', date: '2026-01-15', content: 'Fractions', type: 'lesson' },
    { studentId: 's2', date: '2026-01-16', content: 'Bead work', type: 'observation' },
  ];
  const existing = [
    { studentId: 's1', observedAt: new Date('2026-01-15'), lessonTitle: 'Fractions', type: 'lesson' },
  ];
  const flagged = checkDuplicates(rows, existing);
  assert.equal(flagged[0].isDuplicate, true);
  assert.equal(flagged[1].isDuplicate, false);
});

test('checkDuplicates does not flag when date differs', () => {
  const rows = [
    { studentId: 's1', date: '2026-01-16', content: 'Fractions', type: 'lesson' },
  ];
  const existing = [
    { studentId: 's1', observedAt: new Date('2026-01-15'), lessonTitle: 'Fractions', type: 'lesson' },
  ];
  const flagged = checkDuplicates(rows, existing);
  assert.equal(flagged[0].isDuplicate, false);
});

test('checkDuplicates handles empty existing list', () => {
  const rows = [
    { studentId: 's1', date: '2026-01-15', content: 'Fractions', type: 'lesson' },
  ];
  const flagged = checkDuplicates(rows, []);
  assert.equal(flagged[0].isDuplicate, false);
});

// --- BulkUploadPage.jsx source-level verification ---

const pageSourceUrl = new URL('./BulkUploadPage.jsx', import.meta.url);

test('BulkUploadPage gates access behind isSuperAdmin check', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /isSuperAdmin/.test(source),
    'Expected BulkUploadPage to import or call isSuperAdmin for role-gating',
  );
});

test('BulkUploadPage triggers CSV parsing via parseCSV', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /parseCSV/.test(source),
    'Expected BulkUploadPage to reference parseCSV for CSV file parsing',
  );
});

test('BulkUploadPage uses Firestore writeBatch for bulk writes', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /writeBatch/.test(source),
    'Expected BulkUploadPage to use writeBatch for Firestore bulk writes',
  );
});

test('BulkUploadPage displays results summary after upload', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /setResults/.test(source),
    'Expected BulkUploadPage to set results state for summary display',
  );
  assert.ok(
    /imported/.test(source) && /failed/.test(source),
    'Expected BulkUploadPage results to track imported and failed counts',
  );
});

test('BulkUploadPage uses useNotify hook for notifications', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /useNotify/.test(source),
    'Expected BulkUploadPage to use the useNotify hook',
  );
  assert.ok(
    /notify\.\w+\(/.test(source),
    'Expected BulkUploadPage to call notify methods (success, error, warning)',
  );
});

test('BulkUploadPage checks for duplicate observations', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /checkDuplicates/.test(source),
    'Expected BulkUploadPage to call checkDuplicates for duplicate detection',
  );
  assert.ok(
    /isDuplicate/.test(source),
    'Expected BulkUploadPage to reference isDuplicate flag from duplicate check',
  );
});

// --- PEP-80: Cascading branch/program/classroom filters ---

test('BulkUploadPage fetches branches collection on mount', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /collection\(db,\s*['"]branches['"]\)/.test(source),
    'Expected BulkUploadPage to fetch from branches collection',
  );
});

test('BulkUploadPage uses Autocomplete with multiple prop for classroom multi-select', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /Autocomplete[\s\S]{0,200}multiple/.test(source),
    'Expected BulkUploadPage to use Autocomplete with multiple for classroom selection',
  );
});

test('BulkUploadPage resets downstream selections on branch change', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /setSelectedBranch/.test(source),
    'Expected BulkUploadPage to manage selectedBranch state',
  );
  assert.ok(
    /setSelectedClassrooms\(\[\]\)/.test(source),
    'Expected BulkUploadPage to reset classrooms array when upstream filter changes',
  );
});

test('BulkUploadPage disables Next button until classrooms are selected', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(
    /selectedClassrooms\.length/.test(source),
    'Expected BulkUploadPage to check selectedClassrooms.length for button disabled state',
  );
});

// --- #285: shared one-tap match review ---

test('BulkUploadPage delegates match review to the shared component', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(/import StudentMatchReview from '\.\/StudentMatchReview\.jsx'/.test(source));
  assert.ok(/<StudentMatchReview/.test(source));
  assert.ok(/pool=\{matchPool\}/.test(source) && /fullPool=\{allStudents\}/.test(source));
});

test('BulkUploadPage has no reject/skip or bulk-accept affordances', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(!/handleReject|rejected|Accept All High Confidence/.test(source),
    'Reject and bulk-accept were removed by #285 (all-or-nothing commit)');
});

test('BulkUploadPage hard-blocks proceeding on duplicate mappings', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  assert.ok(/duplicateMappings/.test(source));
  assert.ok(/!allResolved \|\| duplicateMappings\.length > 0/.test(source),
    'Next button must gate on both resolution and duplicate mappings');
});

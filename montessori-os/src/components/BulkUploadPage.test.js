import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchStudentNames,
  buildObservationDoc,
  buildLessonDoc,
  checkDuplicates,
  CONFIDENCE,
} from './BulkUploadPage.helpers.js';

// --- matchStudentNames ---

const STUDENTS = [
  { id: 's1', displayName: 'Aarav Kumar', firstName: 'Aarav', lastName: 'Kumar', classroomId: 'c1' },
  { id: 's2', displayName: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma', classroomId: 'c1' },
  { id: 's3', displayName: 'Arjun Patel', firstName: 'Arjun', lastName: 'Patel', classroomId: 'c2' },
  { id: 's4', displayName: 'Meera Gupta', firstName: 'Meera', lastName: 'Gupta', classroomId: 'c2' },
];

test('matchStudentNames returns high confidence for exact name match', () => {
  const results = matchStudentNames(['Aarav Kumar'], STUDENTS);
  assert.equal(results.length, 1);
  assert.equal(results[0].csvName, 'Aarav Kumar');
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[0].confidence, CONFIDENCE.HIGH);
});

test('matchStudentNames returns match for close fuzzy name', () => {
  const results = matchStudentNames(['Aarav Kumr'], STUDENTS); // typo
  assert.equal(results.length, 1);
  assert.equal(results[0].match.id, 's1');
  assert.ok([CONFIDENCE.HIGH, CONFIDENCE.MEDIUM].includes(results[0].confidence));
});

test('matchStudentNames returns LOW confidence for no reasonable match', () => {
  const results = matchStudentNames(['Zara Williams'], STUDENTS);
  assert.equal(results.length, 1);
  assert.equal(results[0].confidence, CONFIDENCE.LOW);
});

test('matchStudentNames returns results for multiple names', () => {
  const results = matchStudentNames(['Aarav Kumar', 'Priya Sharma', 'Unknown Person'], STUDENTS);
  assert.equal(results.length, 3);
  assert.equal(results[0].match.id, 's1');
  assert.equal(results[1].match.id, 's2');
  assert.equal(results[2].confidence, CONFIDENCE.LOW);
});

test('matchStudentNames filters by classroomId when provided', () => {
  const results = matchStudentNames(['Arjun Patel'], STUDENTS, { classroomId: 'c1' });
  // Arjun is in c2, so should not match when filtering to c1
  assert.equal(results[0].confidence, CONFIDENCE.LOW);
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
  assert.equal(doc.type, 'voice');
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

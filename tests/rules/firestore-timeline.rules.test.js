import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

import { createTimelineQueries } from '../../shared/firebase/timelineQueries.js';
import {
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedDb,
  initializeRulesTestEnvironment,
  seedFirestore,
} from './harness.js';
import { postTransferTimelineFixture } from './fixtures.js';

const firestore = {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
};

function timelineQueriesFor(uid) {
  return createTimelineQueries({
    db: createAuthenticatedDb(uid),
    firestore,
  });
}

test.before(async () => {
  await initializeRulesTestEnvironment();
});

test.after(async () => {
  await closeTestEnvironment();
});

test.beforeEach(async () => {
  await clearTestData();
  await seedFirestore(postTransferTimelineFixture());
});

test('classroomA timeline keeps historical classroomA observations after studentA transfers', async () => {
  const { fetchClassroomTimelineNotes } = timelineQueriesFor('teacherAAuthor');
  const notes = await assertSucceeds(fetchClassroomTimelineNotes({
    classroomId: 'classroomA',
    pageSize: 20,
  }));

  assert.deepEqual(
    notes.map((note) => note.id).sort(),
    ['observationA', 'observationStudentB'],
  );
});

test('classroomB timeline only returns observations logged in classroomB', async () => {
  const { fetchClassroomTimelineNotes } = timelineQueriesFor('teacherB');
  const notes = await assertSucceeds(fetchClassroomTimelineNotes({
    classroomId: 'classroomB',
    pageSize: 20,
  }));

  assert.deepEqual(notes.map((note) => note.id), ['observationB']);
});

test('current classroomB teacher can read studentA full cross-classroom history', async () => {
  const { fetchStudentTimelineNotes } = timelineQueriesFor('teacherB');
  const notes = await assertSucceeds(fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));

  assert.deepEqual(
    notes.map((note) => note.id),
    ['observationB', 'observationA'],
  );
});

test('former classroomA teacher cannot read studentA timeline after transfer', async () => {
  const { fetchStudentTimelineNotes } = timelineQueriesFor('teacherAAuthor');

  await assertFails(fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));
});

test('teacher cannot query another classroom timeline', async () => {
  const { fetchClassroomTimelineNotes } = timelineQueriesFor('teacherAAuthor');

  await assertFails(fetchClassroomTimelineNotes({
    classroomId: 'classroomB',
    pageSize: 20,
  }));
});

test('assigned teacher can fetch the active students shown in their classroom UI', async () => {
  const { fetchActiveClassroomStudents } = timelineQueriesFor('teacherAAuthor');
  const students = await assertSucceeds(fetchActiveClassroomStudents('classroomA'));

  assert.deepEqual(students.map((student) => student.id), ['studentB']);
});

test.todo(
  'unassigned teacher cannot list students from another classroom (#176: current list rule is intentionally tracked)',
);

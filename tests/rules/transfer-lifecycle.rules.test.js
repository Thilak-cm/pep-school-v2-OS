import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { createObservationOperations } from '../../shared/firebase/observationOperations.js';
import { createTimelineQueries } from '../../shared/firebase/timelineQueries.js';
import { createTransferOperations } from '../../shared/firebase/transferOperations.js';
import {
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedDb,
  initializeRulesTestEnvironment,
  seedFirestore,
} from './harness.js';
import { transferLifecycleFixture } from './fixtures.js';

const firestore = {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
};

const operationsFor = (uid) => {
  const db = createAuthenticatedDb(uid);
  return {
    observations: createObservationOperations({ db, firestore }),
    timelines: createTimelineQueries({ db, firestore }),
    transfers: createTransferOperations({ db, firestore }),
  };
};

const transferRequest = {
  sourceClassroomId: 'classroomA',
  destinationClassroomId: 'classroomB',
  studentIds: ['studentA'],
  lastDay: '2026-01-31',
  newStartDate: '2026-02-01',
  note: 'Lifecycle test transfer',
};

test.before(async () => {
  await initializeRulesTestEnvironment();
  await clearTestData();
  await seedFirestore(transferLifecycleFixture());
});

test.after(async () => {
  await closeTestEnvironment();
});

test('Context 0 — before transfer: classroomA and studentA timelines expose observationA to teacherA', async () => {
  const { timelines } = operationsFor('teacherAAuthor');
  const classroomNotes = await assertSucceeds(timelines.fetchClassroomTimelineNotes({
    classroomId: 'classroomA',
    pageSize: 20,
  }));
  const studentNotes = await assertSucceeds(timelines.fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));

  assert.deepEqual(classroomNotes.map((note) => note.id), ['observationA']);
  assert.deepEqual(studentNotes.map((note) => note.id), ['observationA']);
});

test('Context 0 — teacherB cannot read studentA timeline before transfer', async () => {
  const { timelines } = operationsFor('teacherB');
  await assertFails(timelines.fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));
});

test('Transfer event — source-only classroomAdminA cannot move studentA into unmanaged classroomB', async () => {
  const { transfers } = operationsFor('classroomAdminA');
  await assertFails(transfers.transferStudents(transferRequest));
});

test.todo(
  'Transfer event — destination classroomAdminB can move studentA into managed classroomB (#176 rule change)',
);

test('Transfer event — superAdmin executes the same production operation to advance the lifecycle', async () => {
  const { transfers } = operationsFor('superAdmin');
  const result = await assertSucceeds(transfers.transferStudents(transferRequest));
  assert.equal(result.successCount, 1);
  assert.deepEqual(result.failures, []);
});

test('Context 1 — transfer updates student and placement state but preserves observationA classroomId', async () => {
  const db = createAuthenticatedDb('superAdmin');
  const student = await getDoc(doc(db, 'students', 'studentA'));
  const oldPlacement = await getDoc(doc(
    db,
    'students',
    'studentA',
    'placements',
    '2026-01-01__classroomA',
  ));
  const newPlacement = await getDoc(doc(
    db,
    'students',
    'studentA',
    'placements',
    '2026-02-01__classroomB',
  ));
  const oldObservation = await getDoc(doc(
    db,
    'students',
    'studentA',
    'observations',
    'observationA',
  ));

  assert.equal(student.data().classroomId, 'classroomB');
  assert.equal(student.data().branchId, 'branchB');
  assert.equal(oldPlacement.data().endDate, '2026-01-31');
  assert.equal(oldPlacement.data().status, 'ended');
  assert.equal(newPlacement.data().classroomId, 'classroomB');
  assert.equal(newPlacement.data().endDate, null);
  assert.equal(newPlacement.data().status, 'active');
  assert.equal(oldObservation.data().classroomId, 'classroomA');
});

test('Context 1 — teacherA keeps classroomA history but loses studentA timeline access', async () => {
  const { timelines } = operationsFor('teacherAAuthor');
  const classroomNotes = await assertSucceeds(timelines.fetchClassroomTimelineNotes({
    classroomId: 'classroomA',
    pageSize: 20,
  }));
  assert.deepEqual(classroomNotes.map((note) => note.id), ['observationA']);

  await assertFails(timelines.fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));
});

test('Context 1 — teacherB gains studentA history while classroomB timeline is still empty', async () => {
  const { timelines } = operationsFor('teacherB');
  const studentNotes = await assertSucceeds(timelines.fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));
  const classroomNotes = await assertSucceeds(timelines.fetchClassroomTimelineNotes({
    classroomId: 'classroomB',
    pageSize: 20,
  }));

  assert.deepEqual(studentNotes.map((note) => note.id), ['observationA']);
  assert.deepEqual(classroomNotes, []);
});

test('New activity — teacherB creates observationB after the transfer', async () => {
  const { observations } = operationsFor('teacherB');
  const now = Timestamp.now();
  await assertSucceeds(observations.saveObservation({
    studentId: 'studentA',
    observationId: 'observationB',
    data: {
      type: 'text',
      studentId: 'studentA',
      classroomId: 'classroomB',
      text: 'Observation logged after transfer',
      createdBy: 'teacherB',
      createdAt: now,
      observedAt: now,
    },
  }));
});

test('Context 2 — classroom timelines remain historical while teacherB sees full student history', async () => {
  const teacherA = operationsFor('teacherAAuthor').timelines;
  const teacherB = operationsFor('teacherB').timelines;

  const classroomA = await assertSucceeds(teacherA.fetchClassroomTimelineNotes({
    classroomId: 'classroomA',
    pageSize: 20,
  }));
  const classroomB = await assertSucceeds(teacherB.fetchClassroomTimelineNotes({
    classroomId: 'classroomB',
    pageSize: 20,
  }));
  const studentTimeline = await assertSucceeds(teacherB.fetchStudentTimelineNotes({
    studentId: 'studentA',
    pageSize: 20,
  }));

  assert.deepEqual(classroomA.map((note) => note.id), ['observationA']);
  assert.deepEqual(classroomB.map((note) => note.id), ['observationB']);
  assert.deepEqual(
    studentTimeline.map((note) => note.id),
    ['observationB', 'observationA'],
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
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
  createUnauthenticatedDb,
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

function timelineQueriesWithDb(db) {
  return createTimelineQueries({
    db,
    firestore,
  });
}

function timelineQueriesFor(uid) {
  return timelineQueriesWithDb(createAuthenticatedDb(uid));
}

async function fetchClassroomDirectory(db) {
  const snapshot = await getDocs(collection(db, 'classrooms'));
  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
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

test('classroom directory supports assigned teacher, scoped admin, and superadmin reads', async (t) => {
  await t.test('assigned teacher can get their classroom metadata', async () => {
    const db = createAuthenticatedDb('teacherAAuthor');
    const classroom = await assertSucceeds(getDoc(doc(db, 'classrooms', 'classroomA')));
    assert.equal(classroom.data().name, 'Classroom A');
  });

  await t.test('assigned teacher can list the classroom directory used by the UI', async () => {
    const db = createAuthenticatedDb('teacherAAuthor');
    const classrooms = await assertSucceeds(fetchClassroomDirectory(db));
    assert.deepEqual(
      classrooms.map((classroom) => classroom.id).sort(),
      ['classroomA', 'classroomB'],
    );
  });

  await t.test('scoped classroomadmin can list classroom metadata', async () => {
    const db = createAuthenticatedDb('classroomAdminA');
    const classrooms = await assertSucceeds(fetchClassroomDirectory(db));
    assert.deepEqual(
      classrooms.map((classroom) => classroom.id).sort(),
      ['classroomA', 'classroomB'],
    );
  });

  await t.test('superadmin can list classroom metadata', async () => {
    const db = createAuthenticatedDb('superAdmin');
    const classrooms = await assertSucceeds(fetchClassroomDirectory(db));
    assert.deepEqual(
      classrooms.map((classroom) => classroom.id).sort(),
      ['classroomA', 'classroomB'],
    );
  });
});

test('classroom directory denies unassigned, unknown-role, and unauthenticated reads', async (t) => {
  await t.test('unassigned teacher cannot get another classroom metadata doc', async () => {
    const db = createAuthenticatedDb('teacherB');
    await assertFails(getDoc(doc(db, 'classrooms', 'classroomA')));
  });

  await t.test('unknown role cannot list classroom metadata', async () => {
    const db = createAuthenticatedDb('unknownRoleUser');
    await assertFails(fetchClassroomDirectory(db));
  });

  await t.test('unauthenticated client cannot list classroom metadata', async () => {
    const db = createUnauthenticatedDb();
    await assertFails(fetchClassroomDirectory(db));
  });
});

test('unknown-role and unauthenticated Firestore clients cannot cross auth gates', async (t) => {
  const cases = [
    ['unknown role', createAuthenticatedDb('unknownRoleUser')],
    ['unauthenticated', createUnauthenticatedDb()],
  ];

  for (const [name, db] of cases) {
    await t.test(name, async (subtest) => {
      const {
        fetchActiveClassroomStudents,
        fetchClassroomTimelineNotes,
        fetchStudentTimelineNotes,
      } = timelineQueriesWithDb(db);

      await subtest.test('student list', async () => {
        await assertFails(fetchActiveClassroomStudents('classroomA'));
      });

      await subtest.test('classroom timeline', async () => {
        await assertFails(fetchClassroomTimelineNotes({
          classroomId: 'classroomA',
          pageSize: 20,
        }));
      });

      await subtest.test('student timeline', async () => {
        await assertFails(fetchStudentTimelineNotes({
          studentId: 'studentA',
          pageSize: 20,
        }));
      });

      await subtest.test('observation doc get', async () => {
        await assertFails(getDoc(doc(db, 'students', 'studentA', 'observations', 'observationA')));
      });
    });
  }
});

test.todo(
  'unassigned teacher cannot list students from another classroom (#176: current list rule is intentionally tracked)',
);

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

import { createObservationOperations } from '../../shared/firebase/observationOperations.js';
import {
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedDb,
  initializeRulesTestEnvironment,
  seedFirestore,
} from './harness.js';
import { observationWriteFixture } from './fixtures.js';

const firestore = {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
};

function operationsFor(uid) {
  return createObservationOperations({
    db: createAuthenticatedDb(uid),
    firestore,
  });
}

function observationData(type, overrides = {}) {
  const timestamp = Timestamp.now();
  const base = {
    type,
    studentId: 'studentA',
    classroomId: 'classroomA',
    createdBy: 'teacherAAuthor',
    createdAt: timestamp,
    observedAt: timestamp,
  };

  if (type === 'text' || type === 'voice') base.text = `${type} observation`;
  if (type === 'lesson') base.lessonTitle = 'Created lesson';
  if (type === 'media') {
    base.mediaKind = 'photo';
    base.status = 'pending_upload';
    base.media = [{
      storagePath: 'students/studentA/media/newMedia/original.webp',
      contentType: 'image/webp',
      sizeBytes: 1024,
    }];
  }

  return { ...base, ...overrides };
}

test.before(async () => {
  await initializeRulesTestEnvironment();
});

test.after(async () => {
  await closeTestEnvironment();
});

test.beforeEach(async () => {
  await clearTestData();
  await seedFirestore(observationWriteFixture());
});

for (const type of ['text', 'voice', 'lesson']) {
  test(`assigned teacher can create a ${type} observation`, async () => {
    const { saveObservation } = operationsFor('teacherAAuthor');
    await assertSucceeds(saveObservation({
      studentId: 'studentA',
      observationId: `new-${type}`,
      data: observationData(type),
    }));
  });
}

test('assigned teacher can create the Firestore record for a media observation', async () => {
  const { saveMediaObservation } = operationsFor('teacherAAuthor');
  await assertSucceeds(saveMediaObservation({
    studentId: 'studentA',
    observationId: 'newMedia',
    data: observationData('media'),
  }));
});

test('teacher cannot create an observation for a student in another classroom', async () => {
  const { saveObservation } = operationsFor('teacherAAuthor');
  await assertFails(saveObservation({
    studentId: 'studentB',
    observationId: 'cross-classroom',
    data: observationData('text', {
      studentId: 'studentB',
      classroomId: 'classroomB',
    }),
  }));
});

test('observation create rejects mismatched parent student, classroom, or author fields', async (t) => {
  const invalidCases = [
    ['studentId', { studentId: 'studentB' }],
    ['classroomId', { classroomId: 'classroomB' }],
    ['createdBy', { createdBy: 'teacherAPeer' }],
  ];

  for (const [field, overrides] of invalidCases) {
    await t.test(field, async () => {
      const { saveObservation } = operationsFor('teacherAAuthor');
      await assertFails(saveObservation({
        studentId: 'studentA',
        observationId: `invalid-${field}`,
        data: observationData('text', overrides),
      }));
    });
  }
});

test('author can edit their recent text observation', async () => {
  const { updateObservationText } = operationsFor('teacherAAuthor');
  await assertSucceeds(updateObservationText({
    studentId: 'studentA',
    observationId: 'recentText',
    text: 'Updated recent observation',
    editCount: 1,
    editorUid: 'teacherAAuthor',
  }));
});

test('peer teacher cannot perform an ordinary edit on another teacher observation', async () => {
  const { updateObservationText } = operationsFor('teacherAPeer');
  await assertFails(updateObservationText({
    studentId: 'studentA',
    observationId: 'recentText',
    text: 'Peer edit',
    editCount: 1,
    editorUid: 'teacherAPeer',
  }));
});

test('author cannot edit or delete after the 48-hour boundary', async () => {
  const { deleteObservation, updateObservationText } = operationsFor('teacherAAuthor');

  await assertFails(updateObservationText({
    studentId: 'studentA',
    observationId: 'expiredText',
    text: 'Too late',
    editCount: 1,
    editorUid: 'teacherAAuthor',
  }));
  await assertFails(deleteObservation({
    studentId: 'studentA',
    observationId: 'expiredText',
  }));
});

test('author edit and delete use the precise 48-hour boundary', async (t) => {
  await t.test('48 hours minus 1 minute succeeds', async () => {
    const { deleteObservation, updateObservationText } = operationsFor('teacherAAuthor');

    await assertSucceeds(updateObservationText({
      studentId: 'studentA',
      observationId: 'inside48HourText',
      text: 'Inside boundary edit',
      editCount: 1,
      editorUid: 'teacherAAuthor',
    }));
    await assertSucceeds(deleteObservation({
      studentId: 'studentA',
      observationId: 'inside48HourText',
    }));
  });

  await t.test('48 hours plus 1 minute fails', async () => {
    const { deleteObservation, updateObservationText } = operationsFor('teacherAAuthor');

    await assertFails(updateObservationText({
      studentId: 'studentA',
      observationId: 'outside48HourText',
      text: 'Outside boundary edit',
      editCount: 1,
      editorUid: 'teacherAAuthor',
    }));
    await assertFails(deleteObservation({
      studentId: 'studentA',
      observationId: 'outside48HourText',
    }));
  });
});

test('author can delete their recent observation', async () => {
  const { deleteObservation } = operationsFor('teacherAAuthor');
  await assertSucceeds(deleteObservation({
    studentId: 'studentA',
    observationId: 'recentText',
  }));
});

test('scoped classroomadmin can edit and delete classroomA observations', async () => {
  const { deleteObservation, updateObservationFields } = operationsFor('classroomAdminA');

  await assertSucceeds(updateObservationFields({
    studentId: 'studentA',
    observationId: 'recentText',
    fields: { text: 'Admin edit' },
  }));
  await assertSucceeds(deleteObservation({
    studentId: 'studentA',
    observationId: 'recentText',
  }));
});

test('classroomadmin without classroomA scope cannot edit classroomA observations', async () => {
  const { updateObservationFields } = operationsFor('classroomAdminB');
  await assertFails(updateObservationFields({
    studentId: 'studentA',
    observationId: 'recentText',
    fields: { text: 'Out-of-scope admin edit' },
  }));
});

test('lesson link operation changes only forward and backlink fields', async () => {
  const { updateLessonLinks } = operationsFor('teacherAAuthor');
  await assertSucceeds(updateLessonLinks({
    studentId: 'studentA',
    observationId: 'recentText',
    currentLessonIds: [],
    desiredLessonIds: ['lessonA'],
  }));

  const db = createAuthenticatedDb('teacherAAuthor');
  const note = await getDoc(doc(db, 'students', 'studentA', 'observations', 'recentText'));
  const lesson = await getDoc(doc(db, 'students', 'studentA', 'observations', 'lessonA'));
  assert.deepEqual(note.data().linkedLessonObservationId, ['lessonA']);
  assert.deepEqual(lesson.data().linkedObservations, ['recentText']);
});

test.todo(
  'peer teacher can edit only linkedLessonObservationId and linkedObservations (#176 follow-up rule)',
);
test.todo(
  'authorship does not preserve edit/delete access after the student transfers away',
);

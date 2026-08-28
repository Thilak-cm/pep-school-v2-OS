import test from 'node:test';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

import {
  clearStorageData,
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedDb,
  createAuthenticatedStorage,
  initializeRulesTestEnvironment,
  seedFirestore,
  seedStorageObject,
} from './harness.js';

const productionBucket = 'pep-os.firebasestorage.app';
const structuredPath =
  'pending-structured-assessments/structuredUpload/selected-sheet.xlsx';
const medicalPath =
  'pending-medical-assessments/medicalUpload/original.pdf';
const xlsxContentType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function assessmentFixture() {
  const now = Timestamp.now();
  return {
    'users/teacherA': {role: 'teacher'},
    'users/teacherB': {role: 'teacher'},
    'users/superAdmin': {role: 'superadmin'},
    'classrooms/classroomA': {teacherIds: ['teacherA'], status: 'active'},
    'students/studentA': {classroomId: 'classroomA', status: 'active'},
    'students/studentA/observations/assessmentA': {
      type: 'assessment',
      assessmentKind: 'structured',
      schemaVersion: 1,
      studentId: 'studentA',
      classroomId: 'classroomA',
      createdBy: 'teacherA',
      createdAt: now,
      observedAt: now,
    },
    'structuredAssessmentSources/sourceA': {
      createdBy: 'teacherA',
      classroomIds: ['classroomA'],
    },
    'pendingStructuredAssessmentUploads/structuredUpload': {
      kind: 'structured_assessment_upload',
      createdBy: 'teacherA',
      uploadStatus: 'pending_upload',
      selectedSheet: {
        storagePath: structuredPath,
        contentType: xlsxContentType,
        sizeBytes: 3,
      },
      createdAt: now,
    },
    'pendingMedicalAssessmentUploads/medicalUpload': {
      kind: 'medical_assessment_upload',
      createdBy: 'teacherA',
      uploadStatus: 'pending_upload',
      originalFile: {
        storagePath: medicalPath,
        contentType: 'application/pdf',
        sizeBytes: 3,
      },
      createdAt: now,
    },
  };
}

test.before(async () => {
  await initializeRulesTestEnvironment();
});

test.after(async () => {
  await closeTestEnvironment();
});

test.beforeEach(async () => {
  await clearTestData();
  await clearStorageData();
  await seedFirestore(assessmentFixture());
});

test('assessment records and source manifests are client-immutable', async (t) => {
  const teacherDb = createAuthenticatedDb('teacherA');
  const superAdminDb = createAuthenticatedDb('superAdmin');
  const assessmentRef = doc(
    teacherDb,
    'students/studentA/observations/assessmentA',
  );

  await t.test('teacher cannot create an assessment directly', async () => {
    await assertFails(setDoc(
      doc(teacherDb, 'students/studentA/observations/assessmentNew'),
      assessmentFixture()['students/studentA/observations/assessmentA'],
    ));
  });
  await t.test('teacher cannot update or delete a published assessment', async () => {
    await assertFails(updateDoc(assessmentRef, {assessmentName: 'Changed'}));
    await assertFails(deleteDoc(assessmentRef));
  });
  await t.test('superadmin cannot mutate a published assessment', async () => {
    const adminRef = doc(
      superAdminDb,
      'students/studentA/observations/assessmentA',
    );
    await assertFails(updateDoc(adminRef, {assessmentName: 'Changed'}));
    await assertFails(deleteDoc(adminRef));
  });
  await t.test('source manifests are not directly readable', async () => {
    await assertFails(getDoc(doc(
      teacherDb,
      'structuredAssessmentSources/sourceA',
    )));
  });
});

test('structured worksheet staging is owner-bound, MIME-bound, and private', async () => {
  const ownerStorage = createAuthenticatedStorage('teacherA', productionBucket);
  const otherStorage = createAuthenticatedStorage('teacherB', productionBucket);

  await assertSucceeds(uploadBytes(
    ref(ownerStorage, structuredPath),
    new Uint8Array([1, 2, 3]),
    {contentType: xlsxContentType},
  ));
  await assertFails(uploadBytes(
    ref(otherStorage, structuredPath),
    new Uint8Array([1, 2, 3]),
    {contentType: xlsxContentType},
  ));
  await assertFails(uploadBytes(
    ref(ownerStorage, structuredPath),
    new Uint8Array([1, 2, 3]),
    {contentType: 'text/csv'},
  ));
  await assertFails(getBytes(ref(ownerStorage, structuredPath)));
  await assertFails(deleteObject(ref(ownerStorage, structuredPath)));
});

test('medical PDF staging is owner-bound and private', async () => {
  const ownerStorage = createAuthenticatedStorage('teacherA', productionBucket);
  const otherStorage = createAuthenticatedStorage('teacherB', productionBucket);

  await assertSucceeds(uploadBytes(
    ref(ownerStorage, medicalPath),
    new Uint8Array([1, 2, 3]),
    {contentType: 'application/pdf'},
  ));
  await assertFails(uploadBytes(
    ref(otherStorage, medicalPath),
    new Uint8Array([1, 2, 3]),
    {contentType: 'application/pdf'},
  ));
  await assertFails(getBytes(ref(ownerStorage, medicalPath)));
});

test('ready assessment source objects remain backend-only', async () => {
  const readyPath = 'structured-assessments/sourceA/selected-sheet.xlsx';
  await seedStorageObject(
    readyPath,
    new Uint8Array([1, 2, 3]),
    xlsxContentType,
    productionBucket,
  );
  const storage = createAuthenticatedStorage('teacherA', productionBucket);
  await assertFails(getBytes(ref(storage, readyPath)));
  await assertFails(deleteObject(ref(storage, readyPath)));
});

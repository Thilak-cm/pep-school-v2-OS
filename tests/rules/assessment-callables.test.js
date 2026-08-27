import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { Timestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

import {
  clearStorageData,
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedStorage,
  initializeRulesTestEnvironment,
  seedFirestore,
} from './harness.js';

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const XLSX = requireFromFunctions('xlsx');
const productionBucket = 'pep-os.firebasestorage.app';
const xlsxContentType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let callables;
let adminDb;
let adminStorage;
let AdminTimestamp;

const contextFor = (uid) => ({auth: {uid, token: {}}});

function callableFixture() {
  return {
    'users/teacherA': {role: 'teacher', displayName: 'Teacher A'},
    'users/teacherB': {role: 'teacher', displayName: 'Teacher B'},
    'users/superAdmin': {role: 'superadmin', displayName: 'Super Admin'},
    'classrooms/classroomA': {
      teacherIds: ['teacherA'],
      status: 'active',
    },
    'classrooms/classroomB': {
      teacherIds: ['teacherB'],
      status: 'active',
    },
    'students/studentA': {
      displayName: 'Ada Lovelace',
      classroomId: 'classroomA',
      branchId: 'branchA',
      status: 'active',
    },
    'students/studentA2': {
      displayName: 'Grace Hopper',
      classroomId: 'classroomA',
      branchId: 'branchA',
      status: 'active',
    },
    'students/studentB': {
      displayName: 'Other Student',
      classroomId: 'classroomB',
      branchId: 'branchB',
      status: 'active',
    },
  };
}

function workbookBytes(names = ['Ada Lovelace']) {
  const rows = [
    ['Assessment Name', 'Math'],
    ['Assessment Description', 'Fractions'],
    ['Date', '20/08/2026'],
    ['Result 1', 'Score'],
    ['', ''],
    ['Name', 'Result 1'],
    ...names.map((name, index) => [name, String(index + 1)]),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Assessment',
  );
  return XLSX.write(workbook, {type: 'buffer', bookType: 'xlsx'});
}

async function stageStructured(uid, names = ['Ada Lovelace'], filename = 'math.csv') {
  const bytes = workbookBytes(names);
  const created = await callables.createStructuredAssessmentUpload.run({
    originalFilename: filename,
    contentType: xlsxContentType,
    sizeBytes: bytes.length,
  }, contextFor(uid));
  const clientStorage = createAuthenticatedStorage(uid, productionBucket);
  await uploadBytes(
    ref(clientStorage, created.storagePath),
    bytes,
    {contentType: xlsxContentType},
  );
  return {...created, bytes};
}

test.before(async () => {
  await initializeRulesTestEnvironment();
  callables = await import('../../functions/assessments/index.js');
  ({db: adminDb, storage: adminStorage, Timestamp: AdminTimestamp} = await import(
    '../../functions/shared/firebase.js'
  ));
});

test.after(async () => {
  await closeTestEnvironment();
});

test.beforeEach(async () => {
  await clearTestData();
  await clearStorageData();
  await seedFirestore(callableFixture());
});

test('assessment callables reject missing auth and out-of-scope students', async () => {
  await assert.rejects(
    callables.createStructuredAssessmentUpload.run({}, {}),
    (error) => error.code === 'unauthenticated',
  );
  await assert.rejects(
    callables.createMedicalAssessmentUpload.run({
      studentId: 'studentB',
      assessmentName: 'Medical report',
      assessmentDate: '2026-08-20',
      originalFilename: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 3,
    }, contextFor('teacherA')),
    (error) => error.code === 'permission-denied',
  );
});

test('duplicate student mappings reject the whole worksheet and clean staging', async () => {
  const staged = await stageStructured(
    'teacherA',
    ['Ada Lovelace', 'Grace Hopper'],
  );

  await assert.rejects(
    callables.publishStructuredAssessment.run({
      uploadId: staged.uploadId,
      mappings: [
        {sourceName: 'Ada Lovelace', studentId: 'studentA'},
        {sourceName: 'Grace Hopper', studentId: 'studentA'},
      ],
    }, contextFor('teacherA')),
    (error) => error.code === 'invalid-argument' &&
      error.details?.errors?.[0]?.code === 'DUPLICATE_STUDENT_MAPPING',
  );

  const pending = await adminDb.collection('pendingStructuredAssessmentUploads')
    .doc(staged.uploadId).get();
  const [exists] = await adminStorage.bucket().file(staged.storagePath).exists();
  assert.equal(pending.exists, false);
  assert.equal(exists, false);
});

test('a Firestore commit failure removes staged and final workbook artifacts', async () => {
  const staged = await stageStructured('teacherA');
  const originalBatch = adminDb.batch.bind(adminDb);
  adminDb.batch = () => {
    const batch = originalBatch();
    batch.commit = async () => {
      throw new Error('forced commit failure');
    };
    return batch;
  };
  try {
    await assert.rejects(
      callables.publishStructuredAssessment.run({
        uploadId: staged.uploadId,
        mappings: [{sourceName: 'Ada Lovelace', studentId: 'studentA'}],
      }, contextFor('teacherA')),
      (error) => error.code === 'internal',
    );
  } finally {
    delete adminDb.batch;
  }

  const pending = await adminDb.collection('pendingStructuredAssessmentUploads')
    .doc(staged.uploadId).get();
  const sources = await adminDb.collection('structuredAssessmentSources').get();
  const [stagedExists] = await adminStorage.bucket()
    .file(staged.storagePath).exists();
  const [finalFiles] = await adminStorage.bucket().getFiles({
    prefix: 'structured-assessments/',
  });
  assert.equal(pending.exists, false);
  assert.equal(sources.empty, true);
  assert.equal(stagedExists, false);
  assert.equal(finalFiles.length, 0);
});

test('a deletion failure retains durable cleanup paths for retry', async () => {
  const staged = await stageStructured('teacherA');
  const originalBucket = adminStorage.bucket.bind(adminStorage);
  adminStorage.bucket = (...args) => {
    const bucket = originalBucket(...args);
    const originalFile = bucket.file.bind(bucket);
    bucket.file = (storagePath) => {
      const file = originalFile(storagePath);
      file.delete = async () => {
        const error = new Error('forced delete failure');
        error.code = 503;
        throw error;
      };
      return file;
    };
    return bucket;
  };
  try {
    await assert.rejects(
      callables.cancelStructuredAssessmentUpload.run({
        uploadId: staged.uploadId,
      }, contextFor('teacherA')),
      (error) => error.code === 'internal',
    );
  } finally {
    delete adminStorage.bucket;
  }

  const pendingRef = adminDb.collection('pendingStructuredAssessmentUploads')
    .doc(staged.uploadId);
  const pending = await pendingRef.get();
  assert.equal(pending.data().uploadStatus, 'cleanup_pending');
  assert.deepEqual(pending.data().cleanupPaths, [staged.storagePath]);
  assert.equal(pending.data().cleanupFailures[0].code, '503');

  await callables.cancelStructuredAssessmentUpload.run({
    uploadId: staged.uploadId,
  }, contextFor('teacherA'));
  assert.equal((await pendingRef.get()).exists, false);
});

test('medical finalization creates one ready immutable record and removes staging', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  const created = await callables.createMedicalAssessmentUpload.run({
    studentId: 'studentA',
    assessmentName: 'Medical report',
    assessmentDescription: 'Annual report',
    assessmentDate: '2026-08-20',
    originalFilename: 'report.pdf',
    contentType: 'application/pdf',
    sizeBytes: bytes.length,
  }, contextFor('teacherA'));
  const clientStorage = createAuthenticatedStorage('teacherA', productionBucket);
  await uploadBytes(
    ref(clientStorage, created.storagePath),
    bytes,
    {contentType: 'application/pdf'},
  );

  const finalized = await callables.finalizeMedicalAssessmentUpload.run({
    uploadId: created.uploadId,
  }, contextFor('teacherA'));
  const record = await adminDb.collection('students').doc('studentA')
    .collection('observations').doc(created.observationId).get();
  const pending = await adminDb.collection('pendingMedicalAssessmentUploads')
    .doc(created.uploadId).get();

  assert.equal(finalized.uploadStatus, 'ready');
  assert.equal(record.data().assessmentKind, 'medical');
  assert.equal(record.data().uploadStatus, 'ready');
  assert.equal(pending.exists, false);
});

test('duplicate lookup pages until it finds an accessible source', async () => {
  const batch = adminDb.batch();
  for (let index = 0; index < 11; index += 1) {
    batch.set(adminDb.collection('structuredAssessmentSources')
      .doc(`a-inaccessible-${String(index).padStart(2, '0')}`), {
      normalizedFilename: 'math',
      assessmentName: `Hidden ${index}`,
      classroomIds: ['classroomB'],
      createdAt: AdminTimestamp.now(),
    });
  }
  batch.set(adminDb.collection('structuredAssessmentSources')
    .doc('z-accessible'), {
    normalizedFilename: 'math',
    assessmentName: 'Accessible assessment',
    classroomIds: ['classroomA'],
    publishedAt: AdminTimestamp.now(),
  });
  await batch.commit();

  const result = await callables.findStructuredAssessmentDuplicate.run({
    fileName: 'math.csv',
  }, contextFor('teacherA'));

  assert.equal(result.duplicate.sourceId, 'z-accessible');
  assert.match(result.duplicate.publishedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('signed-download callable rejects viewers without full classroom scope', async () => {
  await adminDb.collection('structuredAssessmentSources').doc('sourceB').set({
    classroomIds: ['classroomB'],
    selectedSheet: {
      storagePath: 'structured-assessments/sourceB/selected-sheet.xlsx',
      downloadFilename: 'source.xlsx',
    },
  });

  await assert.rejects(
    callables.getAssessmentDownloadUrl.run({
      assessmentKind: 'structured',
      sourceId: 'sourceB',
    }, contextFor('teacherA')),
    (error) => error.code === 'permission-denied',
  );
});

test('authorized CSV-origin source download uses an XLSX attachment filename', async () => {
  await adminDb.collection('structuredAssessmentSources').doc('sourceA').set({
    sourceFileName: 'math-results.csv',
    classroomIds: ['classroomA'],
    selectedSheet: {
      storagePath: 'structured-assessments/sourceA/selected-sheet.xlsx',
    },
  });
  const originalBucket = adminStorage.bucket.bind(adminStorage);
  let signedOptions = null;
  adminStorage.bucket = (...args) => {
    const bucket = originalBucket(...args);
    const originalFile = bucket.file.bind(bucket);
    bucket.file = (storagePath) => {
      const file = originalFile(storagePath);
      file.getSignedUrl = async (options) => {
        signedOptions = options;
        return ['https://download.test/source.xlsx'];
      };
      return file;
    };
    return bucket;
  };
  let result;
  try {
    result = await callables.getAssessmentDownloadUrl.run({
      assessmentKind: 'structured',
      sourceId: 'sourceA',
    }, contextFor('teacherA'));
  } finally {
    delete adminStorage.bucket;
  }

  assert.equal(result.filename, 'math-results.xlsx');
  assert.match(signedOptions.responseDisposition, /math-results\.xlsx/);
});

test('only administrators can hard-delete assessment records', async () => {
  await adminDb.collection('structuredAssessmentSources').doc('delete-source').set({
    classroomIds: ['classroomA'],
    recordCount: 1,
  });
  await adminDb.collection('students').doc('studentA').collection('observations')
    .doc('delete-record').set({
      type: 'assessment',
      assessmentKind: 'structured',
      sourceId: 'delete-source',
    });

  await assert.rejects(
    callables.deleteAssessment.run({
      assessmentKind: 'structured',
      sourceId: 'delete-source',
    }, contextFor('teacherA')),
    (error) => error.code === 'permission-denied',
  );
  await callables.deleteAssessment.run({
    assessmentKind: 'structured',
    sourceId: 'delete-source',
  }, contextFor('superAdmin'));
  assert.equal((await adminDb.collection('structuredAssessmentSources')
    .doc('delete-source').get()).exists, false);
  assert.equal((await adminDb.collection('students').doc('studentA')
    .collection('observations').doc('delete-record').get()).exists, false);
});

test('hard-delete removes a medical assessment record for a superadmin', async () => {
  await adminDb.collection('students').doc('studentA').collection('observations')
    .doc('medical-delete').set({
      type: 'assessment',
      assessmentKind: 'medical',
      uploadStatus: 'ready',
      classroomId: 'classroomA',
      originalFile: {},
    });
  await callables.deleteAssessment.run({
    assessmentKind: 'medical',
    studentId: 'studentA',
    observationId: 'medical-delete',
  }, contextFor('superAdmin'));
  assert.equal((await adminDb.collection('students').doc('studentA')
    .collection('observations').doc('medical-delete').get()).exists, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { Timestamp } from 'firebase/firestore';

import {
  clearStorageData,
  clearTestData,
  closeTestEnvironment,
  createAuthenticatedStorage,
  createUnauthenticatedStorage,
  initializeRulesTestEnvironment,
  seedFirestore,
  seedStorageObject,
} from './harness.js';

const recent = Timestamp.fromMillis(Date.now() - (60 * 60 * 1000));
const expired = Timestamp.fromMillis(Date.now() - (49 * 60 * 60 * 1000));

const mediaPath = (mediaId, extension = 'webp') => (
  `students/studentA/media/${mediaId}/original.${extension}`
);

function storageFixture() {
  return {
    'users/teacherAAuthor': { role: 'teacher' },
    'users/teacherAPeer': { role: 'teacher' },
    'users/teacherB': { role: 'teacher' },
    'users/classroomAdminA': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomA'],
    },
    'users/classroomAdminB': {
      role: 'classroomadmin',
      manageableClassrooms: ['classroomB'],
    },
    'users/superAdmin': { role: 'superadmin' },
    'users/unknownRoleUser': { role: 'unknown' },
    'students/studentA/observations/mediaRecent': {
      type: 'media',
      mediaKind: 'photo',
      status: 'pending_upload',
      studentId: 'studentA',
      classroomId: 'classroomA',
      createdBy: 'teacherAAuthor',
      createdAt: recent,
      observedAt: recent,
      media: [],
    },
    'students/studentA/observations/mediaExpired': {
      type: 'media',
      mediaKind: 'photo',
      status: 'pending_upload',
      studentId: 'studentA',
      classroomId: 'classroomA',
      createdBy: 'teacherAAuthor',
      createdAt: expired,
      observedAt: expired,
      media: [],
    },
    'students/studentA/observations/mediaPdf': {
      type: 'media',
      mediaKind: 'pdf',
      status: 'pending_upload',
      studentId: 'studentA',
      classroomId: 'classroomA',
      createdBy: 'teacherAAuthor',
      createdAt: recent,
      observedAt: recent,
      media: [],
    },
    'students/studentA/observations/mediaVideo': {
      type: 'media',
      mediaKind: 'video',
      status: 'pending_upload',
      studentId: 'studentA',
      classroomId: 'classroomA',
      createdBy: 'teacherAAuthor',
      createdAt: recent,
      observedAt: recent,
      media: [],
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
  await seedFirestore(storageFixture());
});

test('photo upload succeeds at the exact 2 MiB boundary', async () => {
  const storage = createAuthenticatedStorage('teacherAAuthor');
  const bytes = new Uint8Array(2 * 1024 * 1024);

  await assertSucceeds(uploadBytes(
    ref(storage, mediaPath('mediaRecent')),
    bytes,
    { contentType: 'image/webp' },
  ));
});

test('photo upload fails one byte above the 2 MiB boundary', async () => {
  const storage = createAuthenticatedStorage('teacherAAuthor');
  const bytes = new Uint8Array((2 * 1024 * 1024) + 1);

  await assertFails(uploadBytes(
    ref(storage, mediaPath('mediaRecent')),
    bytes,
    { contentType: 'image/webp' },
  ));
});

test('media upload enforces the file extension and MIME type pair', async (t) => {
  const invalidCases = [
    ['wrong MIME', 'mediaRecent', 'webp', 'image/jpeg'],
    ['wrong photo extension', 'mediaRecent', 'jpg', 'image/webp'],
    ['wrong PDF extension', 'mediaPdf', 'webp', 'application/pdf'],
    ['wrong video MIME', 'mediaVideo', 'mp4', 'video/quicktime'],
  ];

  for (const [name, mediaId, extension, contentType] of invalidCases) {
    await t.test(name, async () => {
      const storage = createAuthenticatedStorage('teacherAAuthor');
      await assertFails(uploadBytes(
        ref(storage, mediaPath(mediaId, extension)),
        new Uint8Array(32),
        { contentType },
      ));
    });
  }
});

test('valid small photo, PDF, and video uploads use their production path contracts', async (t) => {
  const validCases = [
    ['photo', 'mediaRecent', 'webp', 'image/webp'],
    ['PDF', 'mediaPdf', 'pdf', 'application/pdf'],
    ['video', 'mediaVideo', 'mp4', 'video/mp4'],
  ];

  for (const [name, mediaId, extension, contentType] of validCases) {
    await t.test(name, async () => {
      const storage = createAuthenticatedStorage('teacherAAuthor');
      await assertSucceeds(uploadBytes(
        ref(storage, mediaPath(mediaId, extension)),
        new Uint8Array(32),
        { contentType },
      ));
    });
  }
});

test('unauthenticated and unknown-role clients cannot upload media', async (t) => {
  await t.test('unauthenticated', async () => {
    const storage = createUnauthenticatedStorage();
    await assertFails(uploadBytes(
      ref(storage, mediaPath('mediaRecent')),
      new Uint8Array(32),
      { contentType: 'image/webp' },
    ));
  });

  await t.test('unknown role', async () => {
    const storage = createAuthenticatedStorage('unknownRoleUser');
    await assertFails(uploadBytes(
      ref(storage, mediaPath('mediaRecent')),
      new Uint8Array(32),
      { contentType: 'image/webp' },
    ));
  });
});

test('recognized author can read a valid stored media object', async () => {
  await seedStorageObject(
    mediaPath('mediaRecent'),
    new Uint8Array([1, 2, 3]),
    'image/webp',
  );
  const storage = createAuthenticatedStorage('teacherAAuthor');
  const bytes = await assertSucceeds(getBytes(ref(storage, mediaPath('mediaRecent'))));
  assert.deepEqual([...new Uint8Array(bytes)], [1, 2, 3]);
});

test('recent author can delete their media object', async () => {
  await seedStorageObject(
    mediaPath('mediaRecent'),
    new Uint8Array([1]),
    'image/webp',
  );
  const storage = createAuthenticatedStorage('teacherAAuthor');
  await assertSucceeds(deleteObject(ref(storage, mediaPath('mediaRecent'))));
});

test('peer teacher and expired author cannot delete media', async (t) => {
  await t.test('peer teacher', async () => {
    await seedStorageObject(
      mediaPath('mediaRecent'),
      new Uint8Array([1]),
      'image/webp',
    );
    const storage = createAuthenticatedStorage('teacherAPeer');
    await assertFails(deleteObject(ref(storage, mediaPath('mediaRecent'))));
  });

  await t.test('expired author', async () => {
    await seedStorageObject(
      mediaPath('mediaExpired'),
      new Uint8Array([1]),
      'image/webp',
    );
    const storage = createAuthenticatedStorage('teacherAAuthor');
    await assertFails(deleteObject(ref(storage, mediaPath('mediaExpired'))));
  });
});

test('classroomadmin delete follows manageable classroom scope', async (t) => {
  await t.test('scoped admin succeeds', async () => {
    await seedStorageObject(
      mediaPath('mediaRecent'),
      new Uint8Array([1]),
      'image/webp',
    );
    const storage = createAuthenticatedStorage('classroomAdminA');
    await assertSucceeds(deleteObject(ref(storage, mediaPath('mediaRecent'))));
  });

  await t.test('out-of-scope admin fails', async () => {
    await seedStorageObject(
      mediaPath('mediaRecent'),
      new Uint8Array([1]),
      'image/webp',
    );
    const storage = createAuthenticatedStorage('classroomAdminB');
    await assertFails(deleteObject(ref(storage, mediaPath('mediaRecent'))));
  });
});

test.todo(
  'recognized staff cannot read media from a classroom/student they cannot access (#176 storage scoping)',
);

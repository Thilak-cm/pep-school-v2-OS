/**
 * Tests for PEP-58: lesson tag fields on media doc payloads.
 *
 * Verifies that buildMediaDocData correctly includes/excludes
 * linkedLessonObservationId and lessonBacklinkIds fields.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMediaDocData } from './mediaDocBuilder.js';

const BASE_PAYLOAD = {
  studentId: 'stu1',
  classroomId: 'cls1',
  mediaKind: 'photo',
  source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
  createdBy: 'uid1',
};

test('buildMediaDocData includes linkedLessonObservationId when present', () => {
  const doc = buildMediaDocData(
    { ...BASE_PAYLOAD, linkedLessonObservationId: ['lesson_abc'] },
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.deepEqual(doc.linkedLessonObservationId, ['lesson_abc']);
});

test('buildMediaDocData omits linkedLessonObservationId when absent', () => {
  const doc = buildMediaDocData(
    BASE_PAYLOAD,
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.equal(doc.linkedLessonObservationId, undefined);
});

test('buildMediaDocData omits linkedLessonObservationId when empty array', () => {
  const doc = buildMediaDocData(
    { ...BASE_PAYLOAD, linkedLessonObservationId: [] },
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.equal(doc.linkedLessonObservationId, undefined);
});

test('buildMediaDocData includes lessonBacklinkIds when present', () => {
  const doc = buildMediaDocData(
    { ...BASE_PAYLOAD, lessonBacklinkIds: ['lesson_abc', 'lesson_def'] },
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.deepEqual(doc.lessonBacklinkIds, ['lesson_abc', 'lesson_def']);
});

test('buildMediaDocData omits lessonBacklinkIds when absent', () => {
  const doc = buildMediaDocData(
    BASE_PAYLOAD,
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.equal(doc.lessonBacklinkIds, undefined);
});

test('buildMediaDocData omits lessonBacklinkIds when empty array', () => {
  const doc = buildMediaDocData(
    { ...BASE_PAYLOAD, lessonBacklinkIds: [] },
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.equal(doc.lessonBacklinkIds, undefined);
});

test('buildMediaDocData includes both lesson fields together', () => {
  const doc = buildMediaDocData(
    {
      ...BASE_PAYLOAD,
      linkedLessonObservationId: ['lesson_abc'],
      lessonBacklinkIds: ['lesson_abc'],
    },
    'media_1',
    'students/stu1/media/media_1/original.webp'
  );
  assert.deepEqual(doc.linkedLessonObservationId, ['lesson_abc']);
  assert.deepEqual(doc.lessonBacklinkIds, ['lesson_abc']);
});

test('buildMediaDocData lesson fields work for PDFs too', () => {
  const doc = buildMediaDocData(
    {
      ...BASE_PAYLOAD,
      mediaKind: 'pdf',
      source: { contentType: 'application/pdf', size: 2048, extension: 'pdf' },
      pdfTitle: 'My PDF',
      linkedLessonObservationId: ['lesson_abc'],
      lessonBacklinkIds: ['lesson_abc'],
    },
    'media_1',
    'students/stu1/media/media_1/original.pdf'
  );
  assert.deepEqual(doc.linkedLessonObservationId, ['lesson_abc']);
  assert.deepEqual(doc.lessonBacklinkIds, ['lesson_abc']);
});

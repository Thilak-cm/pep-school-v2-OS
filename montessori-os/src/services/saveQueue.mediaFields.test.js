/**
 * Tests for PEP-43: copied + handwritten fields on media doc payloads.
 *
 * These tests verify that deriveMediaPayload correctly includes the new
 * per-image boolean fields in the Firestore document data.
 *
 * Since deriveMediaPayload is tightly coupled to Firebase (setDoc, getDoc,
 * storage upload), we test the doc-building logic by extracting the payload
 * construction into a pure helper: buildMediaDocData.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMediaDocData } from '../utils/mediaDocBuilder.js';

test('buildMediaDocData includes copied=false by default for photos', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.copied, false, 'copied should default to false');
});

test('buildMediaDocData includes copied=true when payload sets it', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    copied: true,
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.copied, true, 'copied should be true when explicitly set');
});

test('buildMediaDocData includes handwritten=false by default for photos', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.handwritten, false, 'handwritten should default to false');
});

test('buildMediaDocData includes handwritten=true when payload sets it', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    handwritten: true,
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.handwritten, true, 'handwritten should be true when explicitly set');
});

test('buildMediaDocData does not include copied/handwritten for PDFs', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'pdf',
    source: { contentType: 'application/pdf', size: 2048, extension: 'pdf' },
    createdBy: 'uid1',
    pdfTitle: 'My PDF',
  }, 'media_1', 'students/stu1/media/media_1/original.pdf');

  assert.equal(doc.copied, undefined, 'PDFs should not have copied field');
  assert.equal(doc.handwritten, undefined, 'PDFs should not have handwritten field');
});

test('buildMediaDocData includes photoAnalysis when payload has it (PEP-32)', () => {
  const analysis = {
    handwritten: true,
    contentCategory: 'student_work',
    description: 'Cursive writing practice',
    materialsIdentified: ['lined paper'],
    curriculumArea: 'Language',
    curriculumSubArea: 'Writing - Cursive',
    developmentalNotes: 'Good letter formation',
    writingAnalysis: { handwriting: { rating: 3, note: 'Consistent' } },
    teacherEdited: false,
  };
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    photoAnalysis: analysis,
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.deepEqual(doc.photoAnalysis, analysis, 'photoAnalysis should be persisted');
  assert.equal(doc.handwritten, true, 'handwritten backward compat derived from photoAnalysis');
});

test('buildMediaDocData omits photoAnalysis when payload lacks it', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.photoAnalysis, undefined, 'no photoAnalysis when not in payload');
});

test('buildMediaDocData does not include photoAnalysis for PDFs', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'pdf',
    photoAnalysis: { handwritten: false, contentCategory: 'other' },
    source: { contentType: 'application/pdf', size: 2048, extension: 'pdf' },
    createdBy: 'uid1',
    pdfTitle: 'My PDF',
  }, 'media_1', 'students/stu1/media/media_1/original.pdf');

  assert.equal(doc.photoAnalysis, undefined, 'PDFs should not have photoAnalysis');
});

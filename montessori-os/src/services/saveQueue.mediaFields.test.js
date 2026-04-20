/**
 * Tests for media doc payload fields (PEP-131 → PEP-146).
 *
 * These tests verify that buildMediaDocData correctly includes
 * classification fields in the Firestore document data.
 * description and handwritingAnalysis removed in PEP-146.
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

test('buildMediaDocData includes curriculumArea for photos (PEP-146)', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'photo',
    handwritten: true,
    curriculumArea: 'Language',
    source: { contentType: 'image/webp', size: 1024, extension: 'webp' },
    createdBy: 'uid1',
  }, 'media_1', 'students/stu1/media/media_1/original.webp');

  assert.equal(doc.handwritten, true);
  assert.equal(doc.curriculumArea, 'Language');
  assert.equal(doc.description, undefined, 'description should not be present (PEP-146)');
  assert.equal(doc.handwritingAnalysis, undefined, 'handwritingAnalysis should not be present (PEP-146)');
});

test('buildMediaDocData does not include photo fields for PDFs', () => {
  const doc = buildMediaDocData({
    studentId: 'stu1',
    classroomId: 'cls1',
    mediaKind: 'pdf',
    curriculumArea: 'Language',
    source: { contentType: 'application/pdf', size: 2048, extension: 'pdf' },
    createdBy: 'uid1',
    pdfTitle: 'My PDF',
  }, 'media_1', 'students/stu1/media/media_1/original.pdf');

  assert.equal(doc.curriculumArea, undefined, 'PDFs should not have curriculumArea');
});

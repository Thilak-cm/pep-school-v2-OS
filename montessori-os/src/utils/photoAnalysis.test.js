/**
 * Tests for photoAnalysis parser (PEP-32).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoAnalysis } from './photoAnalysis.js';

describe('parsePhotoAnalysis', () => {
  test('parses valid student_work response with no writing', () => {
    const raw = JSON.stringify({
      handwritten: false,
      contentCategory: 'student_work',
      description: 'A child\'s addition work using golden beads with number cards laid out on a mat.',
      materialsIdentified: ['golden beads', 'number cards'],
      curriculumArea: 'Mathematics',
      curriculumSubArea: 'Decimal System - Dynamic Addition',
      developmentalNotes: 'Shows understanding of place value and can compose 4-digit numbers.',
      writingAnalysis: null,
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.handwritten, false);
    assert.equal(result.contentCategory, 'student_work');
    assert.equal(result.description, 'A child\'s addition work using golden beads with number cards laid out on a mat.');
    assert.deepEqual(result.materialsIdentified, ['golden beads', 'number cards']);
    assert.equal(result.curriculumArea, 'Mathematics');
    assert.equal(result.curriculumSubArea, 'Decimal System - Dynamic Addition');
    assert.equal(result.developmentalNotes, 'Shows understanding of place value and can compose 4-digit numbers.');
    assert.equal(result.writingAnalysis, null);
    assert.equal(result.teacherEdited, false);
  });

  test('parses valid handwritten student_work with writingAnalysis', () => {
    const raw = JSON.stringify({
      handwritten: true,
      contentCategory: 'student_work',
      description: 'Child practicing cursive lowercase letters a through g on lined paper.',
      materialsIdentified: ['lined writing paper', 'pencil'],
      curriculumArea: 'Language',
      curriculumSubArea: 'Writing - Cursive Introduction',
      developmentalNotes: 'Consistent letter formation with appropriate sizing within lines.',
      writingAnalysis: {
        handwriting: { rating: 3, note: 'Consistent sizing, some pressure variation' },
        spelling: { rating: null, note: 'Not enough text to evaluate' },
        vocabulary: { rating: null, note: 'Not applicable for letter practice' },
        structure: { rating: null, note: 'Not applicable for letter practice' },
        punctuation: { rating: null, note: 'Not applicable for letter practice' },
      },
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.handwritten, true);
    assert.equal(result.contentCategory, 'student_work');
    assert.equal(result.writingAnalysis.handwriting.rating, 3);
    assert.equal(result.writingAnalysis.spelling.rating, null);
    assert.equal(result.writingAnalysis.spelling.note, 'Not enough text to evaluate');
  });

  test('parses non-student-work response — rich fields are null', () => {
    const raw = JSON.stringify({
      handwritten: false,
      contentCategory: 'other',
      description: null,
      materialsIdentified: [],
      curriculumArea: null,
      curriculumSubArea: null,
      developmentalNotes: null,
      writingAnalysis: null,
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.contentCategory, 'other');
    assert.equal(result.description, null);
    assert.equal(result.curriculumArea, null);
    assert.equal(result.developmentalNotes, null);
    assert.deepEqual(result.materialsIdentified, []);
  });

  test('returns defaults for malformed JSON string', () => {
    const result = parsePhotoAnalysis('not valid json {{{');
    assert.equal(result.handwritten, false);
    assert.equal(result.contentCategory, 'other');
    assert.equal(result.description, null);
    assert.deepEqual(result.materialsIdentified, []);
    assert.equal(result.writingAnalysis, null);
  });

  test('returns defaults for empty/null input', () => {
    assert.equal(parsePhotoAnalysis(null).contentCategory, 'other');
    assert.equal(parsePhotoAnalysis('').contentCategory, 'other');
    assert.equal(parsePhotoAnalysis(undefined).contentCategory, 'other');
  });

  test('handles missing optional fields with defaults', () => {
    const raw = JSON.stringify({
      handwritten: true,
      contentCategory: 'student_work',
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.handwritten, true);
    assert.equal(result.contentCategory, 'student_work');
    assert.equal(result.description, null);
    assert.deepEqual(result.materialsIdentified, []);
    assert.equal(result.curriculumArea, null);
    assert.equal(result.curriculumSubArea, null);
    assert.equal(result.developmentalNotes, null);
    assert.equal(result.writingAnalysis, null);
    assert.equal(result.teacherEdited, false);
  });

  test('accepts already-parsed object (not just string)', () => {
    const obj = {
      handwritten: false,
      contentCategory: 'student_work',
      description: 'Pink tower work',
      materialsIdentified: ['pink tower'],
      curriculumArea: 'Sensorial',
      curriculumSubArea: null,
      developmentalNotes: null,
      writingAnalysis: null,
    };
    const result = parsePhotoAnalysis(obj);
    assert.equal(result.description, 'Pink tower work');
    assert.equal(result.curriculumArea, 'Sensorial');
  });

  test('preserves teacherEdited flag on round-trip parse', () => {
    const obj = {
      handwritten: false,
      contentCategory: 'student_work',
      description: 'Edited description',
      teacherEdited: true,
    };
    const result = parsePhotoAnalysis(obj);
    assert.equal(result.teacherEdited, true);
  });

  test('coerces invalid contentCategory to "other"', () => {
    const raw = JSON.stringify({ handwritten: false, contentCategory: 'banana' });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.contentCategory, 'other');
  });

  test('strips writingAnalysis when handwritten is false', () => {
    const raw = JSON.stringify({
      handwritten: false,
      contentCategory: 'student_work',
      writingAnalysis: { handwriting: { rating: 3, note: 'test' } },
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.writingAnalysis, null);
  });

  test('validates writingAnalysis dimension shape', () => {
    const raw = JSON.stringify({
      handwritten: true,
      contentCategory: 'student_work',
      writingAnalysis: {
        handwriting: { rating: 4, note: 'Good' },
        spelling: { rating: 2, note: 'Needs work' },
        vocabulary: { rating: 3, note: 'Average' },
        structure: { rating: null, note: 'N/A' },
        punctuation: { rating: 5, note: 'Excellent' },
      },
    });
    const result = parsePhotoAnalysis(raw);
    assert.equal(result.writingAnalysis.handwriting.rating, 4);
    assert.equal(result.writingAnalysis.punctuation.rating, 5);
    assert.equal(result.writingAnalysis.structure.rating, null);
  });
});

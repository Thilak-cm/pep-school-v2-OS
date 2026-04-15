/**
 * Tests for photoAnalysis parser (PEP-131).
 * Two-step pipeline: parseClassification (Call 1) + parseHandwritingAnalysis (Call 2).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClassification,
  parseHandwritingAnalysis,
  buildMediaFields,
  WRITING_DIMENSIONS,
} from './photoAnalysis.js';

/* ------------------------------------------------------------------ */
/*  WRITING_DIMENSIONS constant                                       */
/* ------------------------------------------------------------------ */
describe('WRITING_DIMENSIONS', () => {
  test('exports exactly five dimensions in canonical order', () => {
    assert.deepEqual(WRITING_DIMENSIONS, [
      'handwriting', 'spelling', 'vocabulary', 'structure', 'punctuation',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  parseClassification  (Call 1 — gpt-5.4-nano)                      */
/* ------------------------------------------------------------------ */
describe('parseClassification', () => {
  test('parses valid classification response', () => {
    const raw = JSON.stringify({
      handwritten: false,
      curriculumArea: 'Mathematics',
      description: 'A child working with golden beads on a mat.',
    });
    const result = parseClassification(raw);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, 'Mathematics');
    assert.equal(result.description, 'A child working with golden beads on a mat.');
  });

  test('parses handwritten classification', () => {
    const result = parseClassification({
      handwritten: true,
      curriculumArea: 'Language',
      description: 'Child writing cursive letters on lined paper.',
    });
    assert.equal(result.handwritten, true);
    assert.equal(result.curriculumArea, 'Language');
  });

  test('returns defaults for null/undefined/empty input', () => {
    for (const input of [null, undefined, '', 0]) {
      const result = parseClassification(input);
      assert.equal(result.handwritten, false);
      assert.equal(result.curriculumArea, null);
      assert.equal(result.description, null);
    }
  });

  test('returns defaults for malformed JSON string', () => {
    const result = parseClassification('not valid json {{{');
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, null);
    assert.equal(result.description, null);
  });

  test('coerces handwritten to boolean', () => {
    assert.equal(parseClassification({ handwritten: 1 }).handwritten, false);
    assert.equal(parseClassification({ handwritten: 'yes' }).handwritten, false);
    assert.equal(parseClassification({ handwritten: true }).handwritten, true);
  });

  test('validates curriculumArea as string or null', () => {
    assert.equal(parseClassification({ curriculumArea: 123 }).curriculumArea, null);
    assert.equal(parseClassification({ curriculumArea: '' }).curriculumArea, null);
    assert.equal(parseClassification({ curriculumArea: 'Sensorial' }).curriculumArea, 'Sensorial');
  });

  test('validates description as string or null', () => {
    assert.equal(parseClassification({ description: 123 }).description, null);
    assert.equal(parseClassification({ description: '' }).description, null);
    assert.equal(parseClassification({ description: 'A photo' }).description, 'A photo');
  });

  test('accepts already-parsed object', () => {
    const obj = { handwritten: false, curriculumArea: 'Practical Life', description: 'Pouring water' };
    const result = parseClassification(obj);
    assert.equal(result.curriculumArea, 'Practical Life');
    assert.equal(result.description, 'Pouring water');
  });

  test('ignores extra fields from old schema', () => {
    const result = parseClassification({
      handwritten: false,
      contentCategory: 'student_work',
      materialsIdentified: ['pink tower'],
      curriculumSubArea: 'Visual Discrimination',
      curriculumArea: 'Sensorial',
      description: 'Pink tower',
    });
    assert.equal(result.curriculumArea, 'Sensorial');
    assert.equal(result.description, 'Pink tower');
    assert.equal(result.contentCategory, undefined);
    assert.equal(result.materialsIdentified, undefined);
    assert.equal(result.curriculumSubArea, undefined);
  });
});

/* ------------------------------------------------------------------ */
/*  parseHandwritingAnalysis  (Call 2 — gpt-5.4)                      */
/* ------------------------------------------------------------------ */
describe('parseHandwritingAnalysis', () => {
  test('parses valid handwriting analysis with all dimensions', () => {
    const raw = JSON.stringify({
      developmentalNotes: 'Strong letter formation for age 5.',
      handwriting: { rating: 4, note: 'Consistent sizing' },
      spelling: { rating: 3, note: 'Some reversals' },
      vocabulary: { rating: 3, note: 'Age-appropriate word choice' },
      structure: { rating: 2, note: 'Single sentence only' },
      punctuation: { rating: null, note: 'No punctuation attempted' },
    });
    const result = parseHandwritingAnalysis(raw);
    assert.equal(result.developmentalNotes, 'Strong letter formation for age 5.');
    assert.equal(result.handwriting.rating, 4);
    assert.equal(result.spelling.rating, 3);
    assert.equal(result.punctuation.rating, null);
    assert.equal(result.punctuation.note, 'No punctuation attempted');
  });

  test('returns null for null/undefined/empty input', () => {
    assert.equal(parseHandwritingAnalysis(null), null);
    assert.equal(parseHandwritingAnalysis(undefined), null);
    assert.equal(parseHandwritingAnalysis(''), null);
  });

  test('returns null for malformed JSON string', () => {
    assert.equal(parseHandwritingAnalysis('bad json'), null);
  });

  test('validates ratings are integers 1-5 or null', () => {
    const result = parseHandwritingAnalysis({
      developmentalNotes: 'Test',
      handwriting: { rating: 0, note: 'Too low' },
      spelling: { rating: 6, note: 'Too high' },
      vocabulary: { rating: 3.5, note: 'Not integer' },
      structure: { rating: 'three', note: 'Not number' },
      punctuation: { rating: 4, note: 'Valid' },
    });
    assert.equal(result.handwriting.rating, null);
    assert.equal(result.spelling.rating, null);
    assert.equal(result.vocabulary.rating, null);
    assert.equal(result.structure.rating, null);
    assert.equal(result.punctuation.rating, 4);
  });

  test('handles missing dimensions with null rating/note', () => {
    const result = parseHandwritingAnalysis({
      developmentalNotes: 'Brief note',
    });
    for (const dim of WRITING_DIMENSIONS) {
      assert.deepEqual(result[dim], { rating: null, note: null });
    }
  });

  test('handles missing developmentalNotes', () => {
    const result = parseHandwritingAnalysis({
      handwriting: { rating: 3, note: 'OK' },
    });
    assert.equal(result.developmentalNotes, null);
  });

  test('validates note as string or null', () => {
    const result = parseHandwritingAnalysis({
      developmentalNotes: 'Test',
      handwriting: { rating: 3, note: 123 },
      spelling: { rating: 2, note: null },
    });
    assert.equal(result.handwriting.note, null);
    assert.equal(result.spelling.note, null);
  });

  test('accepts already-parsed object', () => {
    const obj = {
      developmentalNotes: 'Good progress',
      handwriting: { rating: 5, note: 'Excellent' },
      spelling: { rating: 4, note: 'Strong' },
      vocabulary: { rating: 3, note: 'Average' },
      structure: { rating: 3, note: 'Developing' },
      punctuation: { rating: 2, note: 'Emerging' },
    };
    const result = parseHandwritingAnalysis(obj);
    assert.equal(result.handwriting.rating, 5);
    assert.equal(result.developmentalNotes, 'Good progress');
  });

  test('all five dimensions are always present in output', () => {
    const result = parseHandwritingAnalysis({ developmentalNotes: 'X' });
    for (const dim of WRITING_DIMENSIONS) {
      assert.ok(dim in result, `missing dimension: ${dim}`);
      assert.ok('rating' in result[dim]);
      assert.ok('note' in result[dim]);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  buildMediaFields — combines classification + analysis             */
/* ------------------------------------------------------------------ */
describe('buildMediaFields', () => {
  test('builds fields from classification only (non-handwritten)', () => {
    const classification = {
      handwritten: false,
      curriculumArea: 'Mathematics',
      description: 'Bead work on a mat',
    };
    const result = buildMediaFields(classification, null);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, 'Mathematics');
    assert.equal(result.description, 'Bead work on a mat');
    assert.equal(result.handwritingAnalysis, null);
  });

  test('builds fields from classification + analysis (handwritten)', () => {
    const classification = {
      handwritten: true,
      curriculumArea: 'Language',
      description: 'Cursive practice',
    };
    const analysis = {
      developmentalNotes: 'Age-appropriate formation',
      handwriting: { rating: 3, note: 'Good sizing' },
      spelling: { rating: null, note: 'N/A' },
      vocabulary: { rating: null, note: 'N/A' },
      structure: { rating: null, note: 'N/A' },
      punctuation: { rating: null, note: 'N/A' },
    };
    const result = buildMediaFields(classification, analysis);
    assert.equal(result.handwritten, true);
    assert.equal(result.curriculumArea, 'Language');
    assert.equal(result.description, 'Cursive practice');
    assert.equal(result.handwritingAnalysis.developmentalNotes, 'Age-appropriate formation');
    assert.equal(result.handwritingAnalysis.handwriting.rating, 3);
  });

  test('forces handwritingAnalysis to null when handwritten is false', () => {
    const classification = { handwritten: false, curriculumArea: 'Art', description: 'Painting' };
    const analysis = {
      developmentalNotes: 'Should be ignored',
      handwriting: { rating: 5, note: 'test' },
    };
    const result = buildMediaFields(classification, analysis);
    assert.equal(result.handwritingAnalysis, null);
  });

  test('handles null classification gracefully', () => {
    const result = buildMediaFields(null, null);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, null);
    assert.equal(result.description, null);
    assert.equal(result.handwritingAnalysis, null);
  });

  test('output has exactly four top-level keys', () => {
    const result = buildMediaFields(
      { handwritten: true, curriculumArea: 'Language', description: 'Test' },
      { developmentalNotes: 'Note', handwriting: { rating: 3, note: 'OK' } },
    );
    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, ['curriculumArea', 'description', 'handwritingAnalysis', 'handwritten']);
  });
});

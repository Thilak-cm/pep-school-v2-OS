/**
 * Tests for photoAnalysis parser (PEP-131 → PEP-146).
 * Call 1 only: parseClassification (gpt-5.4-nano per photo).
 * Call 2 (handwriting analysis) removed — deferred to PEP-132 batch analysis.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClassification,
  buildMediaFields,
  mapVLMResultsToMediaItems,
} from './photoAnalysis.js';

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
/*  buildMediaFields — classification only (no handwriting analysis)   */
/* ------------------------------------------------------------------ */
describe('buildMediaFields', () => {
  test('builds fields from classification (non-handwritten)', () => {
    const classification = {
      handwritten: false,
      curriculumArea: 'Mathematics',
      description: 'Bead work on a mat',
    };
    const result = buildMediaFields(classification);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, 'Mathematics');
    assert.equal(result.description, 'Bead work on a mat');
  });

  test('builds fields from classification (handwritten)', () => {
    const classification = {
      handwritten: true,
      curriculumArea: 'Language',
      description: 'Cursive practice',
    };
    const result = buildMediaFields(classification);
    assert.equal(result.handwritten, true);
    assert.equal(result.curriculumArea, 'Language');
    assert.equal(result.description, 'Cursive practice');
  });

  test('handles null classification gracefully', () => {
    const result = buildMediaFields(null);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, null);
    assert.equal(result.description, null);
  });

  test('output has exactly three top-level keys', () => {
    const result = buildMediaFields(
      { handwritten: true, curriculumArea: 'Language', description: 'Test' },
    );
    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, ['curriculumArea', 'description', 'handwritten']);
  });

  test('does not include handwritingAnalysis key', () => {
    const result = buildMediaFields(
      { handwritten: true, curriculumArea: 'Language', description: 'Test' },
    );
    assert.equal('handwritingAnalysis' in result, false);
  });
});

/* ------------------------------------------------------------------ */
/*  mapVLMResultsToMediaItems — per-photo result mapping (PEP-146)    */
/* ------------------------------------------------------------------ */
describe('mapVLMResultsToMediaItems', () => {
  test('maps results to media items by itemId', () => {
    const results = [
      { itemId: 'a', handwritten: false, curriculumArea: 'Mathematics', description: 'Bead work' },
      { itemId: 'b', handwritten: true, curriculumArea: 'Language', description: 'Cursive' },
    ];
    const mediaItems = [
      { id: 'a', source: { blob: {} } },
      { id: 'b', source: { blob: {} } },
      { id: 'c', source: { blob: {} } }, // no result for this one
    ];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.equal(mapped.length, 3);
    // Item a gets Math classification
    assert.equal(mapped[0].handwritten, false);
    assert.equal(mapped[0].curriculumArea, 'Mathematics');
    assert.equal(mapped[0].description, 'Bead work');
    assert.equal(mapped[0].analyzed, true);
    // Item b gets Language classification
    assert.equal(mapped[1].handwritten, true);
    assert.equal(mapped[1].curriculumArea, 'Language');
    assert.equal(mapped[1].description, 'Cursive');
    assert.equal(mapped[1].analyzed, true);
    // Item c has no result — unchanged
    assert.equal(mapped[2].analyzed, undefined);
    assert.equal(mapped[2].curriculumArea, undefined);
  });

  test('handles empty results array', () => {
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems([], mediaItems);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].analyzed, undefined);
  });

  test('handles null/undefined results gracefully', () => {
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems(null, mediaItems);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].analyzed, undefined);
  });

  test('skips results with missing itemId', () => {
    const results = [
      { handwritten: false, curriculumArea: 'Art', description: 'Painting' },
    ];
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.equal(mapped[0].analyzed, undefined);
  });

  test('does not include handwritingAnalysis in mapped items', () => {
    const results = [
      { itemId: 'a', handwritten: true, curriculumArea: 'Language', description: 'Writing' },
    ];
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.equal('handwritingAnalysis' in mapped[0], false);
  });
});

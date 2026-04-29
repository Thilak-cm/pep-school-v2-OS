/**
 * Tests for photoAnalysis parser (PEP-131 → PEP-146).
 * Call 1 only: parseClassification (gpt-5.4-nano per photo).
 * Returns { handwritten, curriculumArea, materialsIdentified } — description removed in PEP-146.
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
    });
    const result = parseClassification(raw);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, 'Mathematics');
  });

  test('parses handwritten classification', () => {
    const result = parseClassification({
      handwritten: true,
      curriculumArea: 'Language',
    });
    assert.equal(result.handwritten, true);
    assert.equal(result.curriculumArea, 'Language');
  });

  test('returns defaults for null/undefined/empty input', () => {
    for (const input of [null, undefined, '', 0]) {
      const result = parseClassification(input);
      assert.equal(result.handwritten, false);
      assert.equal(result.curriculumArea, null);
    }
  });

  test('returns defaults for malformed JSON string', () => {
    const result = parseClassification('not valid json {{{');
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, null);
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

  test('does not include description in output', () => {
    const result = parseClassification({
      handwritten: false,
      curriculumArea: 'Mathematics',
      description: 'A child working with golden beads',
    });
    assert.equal('description' in result, false);
  });

  test('accepts already-parsed object', () => {
    const obj = { handwritten: false, curriculumArea: 'Practical Life' };
    const result = parseClassification(obj);
    assert.equal(result.curriculumArea, 'Practical Life');
  });

  test('ignores extra fields from old schema', () => {
    const result = parseClassification({
      handwritten: false,
      contentCategory: 'student_work',
      curriculumArea: 'Sensorial',
      description: 'Pink tower',
    });
    assert.equal(result.curriculumArea, 'Sensorial');
    assert.equal(result.contentCategory, undefined);
    assert.equal(result.description, undefined);
  });

  test('parses materialsIdentified array', () => {
    const result = parseClassification({
      handwritten: false,
      curriculumArea: 'Sensorial',
      materialsIdentified: ['Pink Tower', 'Brown Stair'],
    });
    assert.deepEqual(result.materialsIdentified, ['Pink Tower', 'Brown Stair']);
  });

  test('returns empty array when materialsIdentified is missing', () => {
    const result = parseClassification({
      handwritten: true,
      curriculumArea: 'Language',
    });
    assert.deepEqual(result.materialsIdentified, []);
  });

  test('returns empty array when materialsIdentified is null', () => {
    const result = parseClassification({
      handwritten: false,
      curriculumArea: null,
      materialsIdentified: null,
    });
    assert.deepEqual(result.materialsIdentified, []);
  });

  test('filters non-string entries from materialsIdentified', () => {
    const result = parseClassification({
      handwritten: false,
      curriculumArea: 'Mathematics',
      materialsIdentified: ['Golden Beads', 123, null, 'Number Cards'],
    });
    assert.deepEqual(result.materialsIdentified, ['Golden Beads', 'Number Cards']);
  });

  test('deduplicates materialsIdentified entries', () => {
    const result = parseClassification({
      handwritten: false,
      curriculumArea: 'Sensorial',
      materialsIdentified: ['Pink Tower', 'Brown Stair', 'Pink Tower'],
    });
    assert.deepEqual(result.materialsIdentified, ['Pink Tower', 'Brown Stair']);
  });

  test('output has exactly three top-level keys', () => {
    const result = parseClassification({ handwritten: true, curriculumArea: 'Language' });
    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, ['curriculumArea', 'handwritten', 'materialsIdentified']);
  });
});

/* ------------------------------------------------------------------ */
/*  buildMediaFields — classification only (no description)            */
/* ------------------------------------------------------------------ */
describe('buildMediaFields', () => {
  test('builds fields from classification (non-handwritten)', () => {
    const result = buildMediaFields({ handwritten: false, curriculumArea: 'Mathematics' });
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, 'Mathematics');
  });

  test('builds fields from classification (handwritten)', () => {
    const result = buildMediaFields({ handwritten: true, curriculumArea: 'Language' });
    assert.equal(result.handwritten, true);
    assert.equal(result.curriculumArea, 'Language');
  });

  test('handles null classification gracefully', () => {
    const result = buildMediaFields(null);
    assert.equal(result.handwritten, false);
    assert.equal(result.curriculumArea, null);
  });

  test('includes materialsIdentified in output', () => {
    const result = buildMediaFields({
      handwritten: false,
      curriculumArea: 'Mathematics',
      materialsIdentified: ['Golden Beads'],
    });
    assert.deepEqual(result.materialsIdentified, ['Golden Beads']);
  });

  test('defaults materialsIdentified to empty array', () => {
    const result = buildMediaFields({ handwritten: true, curriculumArea: 'Language' });
    assert.deepEqual(result.materialsIdentified, []);
  });

  test('output has exactly three top-level keys', () => {
    const result = buildMediaFields({ handwritten: true, curriculumArea: 'Language' });
    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, ['curriculumArea', 'handwritten', 'materialsIdentified']);
  });
});

/* ------------------------------------------------------------------ */
/*  mapVLMResultsToMediaItems — per-photo result mapping (PEP-146)    */
/* ------------------------------------------------------------------ */
describe('mapVLMResultsToMediaItems', () => {
  test('maps results to media items by itemId', () => {
    const results = [
      { itemId: 'a', handwritten: false, curriculumArea: 'Mathematics' },
      { itemId: 'b', handwritten: true, curriculumArea: 'Language' },
    ];
    const mediaItems = [
      { id: 'a', source: { blob: {} } },
      { id: 'b', source: { blob: {} } },
      { id: 'c', source: { blob: {} } },
    ];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.equal(mapped.length, 3);
    assert.equal(mapped[0].handwritten, false);
    assert.equal(mapped[0].curriculumArea, 'Mathematics');
    assert.equal(mapped[0].analyzed, true);
    assert.equal(mapped[1].handwritten, true);
    assert.equal(mapped[1].curriculumArea, 'Language');
    assert.equal(mapped[1].analyzed, true);
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
    const results = [{ handwritten: false, curriculumArea: 'Art' }];
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.equal(mapped[0].analyzed, undefined);
  });

  test('maps materialsIdentified to media items', () => {
    const results = [
      { itemId: 'a', handwritten: false, curriculumArea: 'Sensorial', materialsIdentified: ['Pink Tower', 'Brown Stair'] },
    ];
    const mediaItems = [{ id: 'a', source: {} }];
    const mapped = mapVLMResultsToMediaItems(results, mediaItems);
    assert.deepEqual(mapped[0].materialsIdentified, ['Pink Tower', 'Brown Stair']);
    assert.equal(mapped[0].analyzed, true);
  });
});

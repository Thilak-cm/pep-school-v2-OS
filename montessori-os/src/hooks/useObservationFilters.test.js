/**
 * Tests for useObservationFilters logic (no React rendering needed).
 * Tests pure functions exported from the hook module.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { computeDisjunctionProduct, buildServerFilters, EMPTY_FILTERS } from './useObservationFilters.js';

// Since the hook uses React hooks internally, we test the filter logic
// by extracting and testing the filtering behavior directly.
// The hook's applyFilters is a closure, so we replicate its curriculum logic here.

function applyFiltersWithCurriculum(observations, filters) {
  let filtered = [...observations];

  // Curriculum area filter (PEP-131 — flat curriculumArea field on media docs)
  if (filters.curriculumAreas && filters.curriculumAreas.length > 0) {
    const selectedAreas = new Set(filters.curriculumAreas);
    filtered = filtered.filter(obs => {
      if (obs.type !== 'media') return true;
      const area = obs.curriculumArea;
      if (!area) return true; // pass through media without analysis (PDFs, videos, older photos)
      return selectedAreas.has(area);
    });
  }

  return filtered;
}

describe('curriculum area filter logic', () => {
  const obs = [
    { id: '1', type: 'text', text: 'Hello' },
    { id: '2', type: 'media', curriculumArea: 'Mathematics' },
    { id: '3', type: 'media', curriculumArea: 'Language' },
    { id: '4', type: 'media' }, // no analysis (video/PDF)
    { id: '5', type: 'media', curriculumArea: null }, // non-student-work
    { id: '6', type: 'voice', text: 'Voice note' },
    { id: '7', type: 'media', curriculumArea: 'Mathematics' },
  ];

  test('no curriculum filter returns all observations', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: [] });
    assert.equal(result.length, obs.length);
  });

  test('filters media by selected curriculum area, keeps unanalyzed media', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics'] });
    assert.equal(result.length, 6); // 2 math media + text + voice + 2 unanalyzed media (pass through)
    assert.ok(result.every(o => o.type !== 'media' || !o.curriculumArea || o.curriculumArea === 'Mathematics'));
  });

  test('multiple curriculum areas selected', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics', 'Language'] });
    assert.equal(result.length, 7); // 2 math + 1 language + text + voice + 2 unanalyzed
  });

  test('non-media observations always pass through', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics'] });
    const nonMedia = result.filter(o => o.type !== 'media');
    assert.equal(nonMedia.length, 2); // text + voice
  });

  test('media without curriculumArea passes through when filter active', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics'] });
    assert.ok(result.find(o => o.id === '4')); // no analysis — passes through
    assert.ok(result.find(o => o.id === '5')); // null curriculumArea — passes through
  });

  test('media with null curriculumArea passes through when filter active', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Language'] });
    assert.ok(result.find(o => o.id === '5'));
  });
});

// --- Disjunction product preflight tests ---

describe('computeDisjunctionProduct', () => {
  test('returns 0 when no authors or types selected', () => {
    assert.equal(computeDisjunctionProduct({ ...EMPTY_FILTERS }), 0);
  });

  test('returns author count when only authors selected', () => {
    assert.equal(computeDisjunctionProduct({
      ...EMPTY_FILTERS, creators: [{ id: 'u1' }, { id: 'u2' }],
    }), 2);
  });

  test('returns type count when only types selected', () => {
    assert.equal(computeDisjunctionProduct({
      ...EMPTY_FILTERS, types: ['voice', 'text', 'lesson'],
    }), 3);
  });

  test('returns product of authors x types', () => {
    assert.equal(computeDisjunctionProduct({
      ...EMPTY_FILTERS,
      creators: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
      types: ['voice', 'text'],
    }), 6);
  });

  test('detects cap breach: 4 authors x 8 types = 32 > 30', () => {
    const creators = Array.from({ length: 4 }, (_, i) => ({ id: `u${i}` }));
    const types = Array.from({ length: 8 }, (_, i) => `type${i}`);
    assert.equal(computeDisjunctionProduct({ ...EMPTY_FILTERS, creators, types }), 32);
  });

  test('below cap: 3 authors x 2 types = 6', () => {
    const creators = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
    const types = ['voice', 'text'];
    assert.equal(computeDisjunctionProduct({ ...EMPTY_FILTERS, creators, types }), 6);
  });
});

// --- buildServerFilters tests ---

describe('buildServerFilters', () => {
  test('returns null when no server-filterable fields active', () => {
    assert.equal(buildServerFilters(EMPTY_FILTERS), null);
  });

  test('extracts author UIDs from creator objects', () => {
    const result = buildServerFilters({
      ...EMPTY_FILTERS,
      creators: [{ id: 'uid1' }, { id: 'uid2' }],
    });
    assert.deepEqual(result.authors, ['uid1', 'uid2']);
  });

  test('passes types through directly', () => {
    const result = buildServerFilters({
      ...EMPTY_FILTERS,
      types: ['voice', 'text'],
    });
    assert.deepEqual(result.types, ['voice', 'text']);
  });

  test('converts dateFrom string to start-of-day timestamp-like', () => {
    const result = buildServerFilters({
      ...EMPTY_FILTERS,
      dateFrom: '2026-10-01',
    });
    assert.ok(result.dateFrom instanceof Date);
    assert.equal(result.dateFrom.getHours(), 0);
    assert.equal(result.dateFrom.getMinutes(), 0);
  });

  test('converts dateTo string to end-of-day timestamp-like', () => {
    const result = buildServerFilters({
      ...EMPTY_FILTERS,
      dateTo: '2026-10-01',
    });
    assert.ok(result.dateTo instanceof Date);
    assert.equal(result.dateTo.getHours(), 23);
    assert.equal(result.dateTo.getMinutes(), 59);
  });

  test('combines all filter fields', () => {
    const result = buildServerFilters({
      ...EMPTY_FILTERS,
      creators: [{ id: 'u1' }],
      types: ['voice'],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-05',
    });
    assert.deepEqual(result.authors, ['u1']);
    assert.deepEqual(result.types, ['voice']);
    assert.ok(result.dateFrom);
    assert.ok(result.dateTo);
  });
});

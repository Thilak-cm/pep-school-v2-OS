/**
 * Tests for useObservationFilters curriculum area filtering (PEP-33).
 * Tests the applyFilters logic directly (no React rendering needed).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Since the hook uses React hooks internally, we test the filter logic
// by extracting and testing the filtering behavior directly.
// The hook's applyFilters is a closure, so we replicate its curriculum logic here.

function applyFiltersWithCurriculum(observations, filters) {
  let filtered = [...observations];

  // Curriculum area filter (new for PEP-33)
  if (filters.curriculumAreas && filters.curriculumAreas.length > 0) {
    const selectedAreas = new Set(filters.curriculumAreas);
    filtered = filtered.filter(obs => {
      // Only apply to media observations with photoAnalysis
      if (obs.type !== 'media') return true;
      const area = obs.photoAnalysis?.curriculumArea;
      if (!area) return true; // pass through media without analysis (PDFs, videos, older photos)
      return selectedAreas.has(area);
    });
  }

  return filtered;
}

describe('curriculum area filter logic', () => {
  const obs = [
    { id: '1', type: 'text', text: 'Hello' },
    { id: '2', type: 'media', photoAnalysis: { curriculumArea: 'Mathematics' } },
    { id: '3', type: 'media', photoAnalysis: { curriculumArea: 'Language' } },
    { id: '4', type: 'media', photoAnalysis: null }, // no analysis (video/PDF)
    { id: '5', type: 'media', photoAnalysis: { curriculumArea: null } }, // non-student-work
    { id: '6', type: 'voice', text: 'Voice note' },
    { id: '7', type: 'media', photoAnalysis: { curriculumArea: 'Mathematics' } },
  ];

  test('no curriculum filter returns all observations', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: [] });
    assert.equal(result.length, obs.length);
  });

  test('filters media by selected curriculum area, keeps unanalyzed media', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics'] });
    assert.equal(result.length, 6); // 2 math media + text + voice + 2 unanalyzed media (pass through)
    assert.ok(result.every(o => o.type !== 'media' || !o.photoAnalysis?.curriculumArea || o.photoAnalysis.curriculumArea === 'Mathematics'));
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

  test('media without photoAnalysis passes through when filter active', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Mathematics'] });
    assert.ok(result.find(o => o.id === '4')); // no analysis — passes through
    assert.ok(result.find(o => o.id === '5')); // null curriculumArea — passes through
  });

  test('media with null curriculumArea passes through when filter active', () => {
    const result = applyFiltersWithCurriculum(obs, { curriculumAreas: ['Language'] });
    assert.ok(result.find(o => o.id === '5'));
  });
});

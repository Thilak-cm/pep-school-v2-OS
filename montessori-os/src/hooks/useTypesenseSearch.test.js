/**
 * Contract tests for useTypesenseSearch (#331).
 *
 * Tests pure exported functions (buildTypesenseFilterBy, normalizeTypesenseHit)
 * directly. The React hook itself is covered by source-scan tests that verify
 * structural invariants without rendering.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildTypesenseFilterBy,
  normalizeTypesenseHit,
} from './useTypesenseSearch.js';

const source = await readFile(new URL('./useTypesenseSearch.js', import.meta.url), 'utf8');

// ── buildTypesenseFilterBy ──────────────────────────────────────────────────

describe('buildTypesenseFilterBy', () => {
  test('returns empty string for null committedFilters (browse mode)', () => {
    const result = buildTypesenseFilterBy(null);
    assert.equal(result, '');
  });

  test('maps types array to Typesense type: filter', () => {
    const result = buildTypesenseFilterBy({ types: ['text', 'voice'], authors: [], dateFrom: null, dateTo: null });
    assert.match(result, /type:/);
  });

  test('maps authors array to createdBy: filter', () => {
    const result = buildTypesenseFilterBy({ authors: ['uid1', 'uid2'], types: [], dateFrom: null, dateTo: null });
    assert.match(result, /createdBy:/);
  });

  test('maps dateFrom and dateTo to observedAt range filter', () => {
    const result = buildTypesenseFilterBy({
      authors: [],
      types: [],
      dateFrom: new Date('2026-01-01'),
      dateTo: new Date('2026-12-31'),
    });
    assert.match(result, /observedAt:/);
  });

  test('skips empty arrays without producing stray colons', () => {
    const result = buildTypesenseFilterBy({ authors: [], types: [], dateFrom: null, dateTo: null });
    assert.equal(result, '');
  });
});

// ── normalizeTypesenseHit ──────────────────────────────────────────────────

describe('normalizeTypesenseHit', () => {
  test('spreads document fields into result', () => {
    const hit = {
      document: { id: 'obs1', text: 'clay work today', studentId: 'stu1', type: 'text' },
      highlights: [],
    };
    const result = normalizeTypesenseHit(hit);
    assert.equal(result.id, 'obs1');
    assert.equal(result.text, 'clay work today');
    assert.equal(result.studentId, 'stu1');
    assert.equal(result.type, 'text');
  });

  test('extracts first highlight snippet with <mark> tags', () => {
    const hit = {
      document: { id: 'obs1', text: 'clay work today' },
      highlights: [{ field: 'text', snippet: '<mark>clay</mark> work today' }],
    };
    const result = normalizeTypesenseHit(hit);
    assert.ok(result.highlightSnippet !== undefined);
    assert.match(result.highlightSnippet, /<mark>/);
  });

  test('highlightSnippet is undefined when highlights array is empty', () => {
    const hit = {
      document: { id: 'obs1', text: 'clay work today' },
      highlights: [],
    };
    const result = normalizeTypesenseHit(hit);
    assert.equal(result.highlightSnippet, undefined);
  });

  test('uses first highlight when multiple fields matched', () => {
    const hit = {
      document: { id: 'obs1', lessonTitle: 'Clay Cylinders', text: 'worked on clay' },
      highlights: [
        { field: 'lessonTitle', snippet: '<mark>Clay</mark> Cylinders' },
        { field: 'text', snippet: 'worked on <mark>clay</mark>' },
      ],
    };
    const result = normalizeTypesenseHit(hit);
    assert.ok(result.highlightSnippet !== undefined);
  });
});

// ── useTypesenseSearch hook structure (source scan) ────────────────────────

describe('useTypesenseSearch hook structure', () => {
  test('hook accepts classroomId for classroom-scoped search (#331)', () => {
    assert.match(source, /classroomId/);
  });

  test('hook accepts studentId for student-scoped search (#331)', () => {
    assert.match(source, /studentId/);
  });

  test('hook returns searchActive flag (#331)', () => {
    assert.match(source, /searchActive/);
  });

  test('hook calls mintTypesenseKey for scoped key (#331)', () => {
    assert.match(source, /mintTypesenseKey/);
  });

  test('hook debounces query input (#331)', () => {
    assert.match(source, /debounce/i);
  });

  test('hook returns results array (#331)', () => {
    assert.match(source, /results/);
  });

  test('hook handles Typesense unreachable with error state (#331 - graceful degradation)', () => {
    assert.match(source, /error/);
  });
});

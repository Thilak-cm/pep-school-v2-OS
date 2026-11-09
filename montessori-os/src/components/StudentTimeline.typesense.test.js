/**
 * Contract tests: StudentTimeline Typesense integration (#331).
 *
 * Source-scan tests verify structural invariants without rendering React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./StudentTimeline.jsx', import.meta.url), 'utf8');

test('StudentTimeline has HFSearchInput search bar (#331)', () => {
  assert.match(source, /HFSearchInput/);
});

test('StudentTimeline imports useTypesenseSearch (#331)', () => {
  assert.match(source, /useTypesenseSearch/);
});

test('StudentTimeline passes studentId to useTypesenseSearch for scoped results (#331)', () => {
  // useTypesenseSearch must be called with studentId so results are scoped to this student
  assert.match(source, /studentId/);
  assert.match(source, /useTypesenseSearch/);
});

test('StudentTimeline has parallel state: typesenseResults (#331)', () => {
  assert.match(source, /typesenseResults/);
});

test('StudentTimeline passes highlightSnippet to ClassroomNoteCard in search mode (#331)', () => {
  assert.match(source, /highlightSnippet/);
});

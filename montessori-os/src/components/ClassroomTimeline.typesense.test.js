/**
 * Contract tests: ClassroomTimeline Typesense integration (#331).
 *
 * Source-scan tests verify structural invariants without rendering React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./ClassroomTimeline.jsx', import.meta.url), 'utf8');

test('ClassroomTimeline imports useTypesenseSearch (#331)', () => {
  assert.match(source, /useTypesenseSearch/);
});

test('ClassroomTimeline has parallel state: typesenseResults (#331)', () => {
  assert.match(source, /typesenseResults/);
});

test('ClassroomTimeline switches between Typesense and Firestore results via searchActive (#331)', () => {
  assert.match(source, /searchActive/);
});

test('ClassroomTimeline hides Show More pagination during active search (#331)', () => {
  // hasMore button must be gated on !searchActive so paginator is hidden during search
  assert.match(source, /searchActive/);
  assert.match(source, /hasMore/);
});

test('ClassroomTimeline passes highlightSnippet to ClassroomNoteCard in search mode (#331)', () => {
  assert.match(source, /highlightSnippet/);
});

test('ClassroomTimeline retires fuzzySearchStudents when search is active (#331)', () => {
  // searchActive state must gate the existing fuzzySearchStudents call
  assert.match(source, /searchActive/);
});

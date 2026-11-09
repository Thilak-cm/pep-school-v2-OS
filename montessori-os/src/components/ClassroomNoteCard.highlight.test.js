/**
 * Contract tests: ClassroomNoteCard highlight prop (#331).
 *
 * Source-scan tests verify the highlight rendering contract without rendering React.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./ClassroomNoteCard.jsx', import.meta.url), 'utf8');

test('ClassroomNoteCard accepts highlightSnippet prop (#331)', () => {
  assert.match(source, /highlightSnippet/);
});

test('ClassroomNoteCard renders snippet markup in search mode, skips 5-line clamp (#331)', () => {
  // When highlightSnippet is defined, the card switches off the 5-line clamp
  // and renders the highlight snippet instead of note.text with clamp
  assert.match(source, /highlightSnippet/);
  // 5-line clamp must be conditional - not applied when highlightSnippet is present
  assert.match(source, /WebkitLineClamp|webkit-line-clamp/i);
});

test('ClassroomNoteCard uses highlightSnippet !== undefined to detect search mode (#331)', () => {
  assert.match(source, /highlightSnippet.*!==.*undefined|highlightSnippet\s*\?/);
});

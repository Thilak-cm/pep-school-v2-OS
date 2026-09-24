import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./FilterPanel.jsx', import.meta.url), 'utf8');

test('note type filter includes an assessments toggle (2026-09-23)', () => {
  // Single 'assessment' type covers both structured and medical.
  assert.match(source, /includes\('assessment'\)/);
  assert.match(source, /Assessments/);
  assert.match(source, /ListChecks/);
});

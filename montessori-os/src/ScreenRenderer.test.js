import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./ScreenRenderer.jsx', import.meta.url), 'utf8');

function caseBlock(caseName, nextCase) {
  const start = source.indexOf(`case "${caseName}":`);
  const end = source.indexOf(`case "${nextCase}":`);
  assert.ok(start >= 0 && end > start, `expected case blocks ${caseName} -> ${nextCase}`);
  return source.slice(start, end);
}

test('studentAssessments is open to every signed-in role (#290)', () => {
  const block = caseBlock('studentAssessments', 'landingPage');
  assert.doesNotMatch(block, /isSuperAdmin/);
});

test('assessmentUpload stays superadmin-only (#290)', () => {
  const block = caseBlock('assessmentUpload', 'studentAssessments');
  assert.match(block, /isSuperAdmin/);
});

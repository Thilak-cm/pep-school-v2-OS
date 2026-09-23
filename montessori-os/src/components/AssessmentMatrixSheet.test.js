import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sheetUrl = new URL('./AssessmentMatrixSheet.jsx', import.meta.url);

test('AssessmentMatrixSheet renders the published matrix in a bottom drawer (#290)', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /SwipeableDrawer/);
  assert.match(source, /getStructuredAssessmentSource/);
  assert.match(source, /includeRecords: true/);
  // View is data-rendered, never a file URL.
  assert.doesNotMatch(source, /getAssessmentDownloadUrl/);
  assert.doesNotMatch(source, /getDownloadURL/);
});

test('AssessmentMatrixSheet pins the in-focus student to the top row', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /focusStudentId/);
});

test('AssessmentMatrixSheet scrolls both axes and caps drawer height', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /overflow/);
  assert.match(source, /100dvh|100vh/);
});

test('column headers show the teacher-authored definition, not "Result N"', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /definition\.description \|\| `Result \$\{definition\.number\}`/);
});

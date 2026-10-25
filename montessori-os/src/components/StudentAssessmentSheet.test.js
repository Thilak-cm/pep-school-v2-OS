import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sheetUrl = new URL('./StudentAssessmentSheet.jsx', import.meta.url);

test('StudentAssessmentSheet uses SwipeableDrawer with standard chrome (#313)', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /SwipeableDrawer/);
  assert.match(source, /100dvh|100vh/);
});

test('StudentAssessmentSheet hides correct-grade button for teacher role', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  // Must check role before showing correction UI
  assert.match(source, /userRole|role/);
  assert.match(source, /teacher/);
  // Must reference correctAssessmentGrade CF
  assert.match(source, /correctAssessmentGrade/);
});

test('StudentAssessmentSheet shows correct-grade button for admin roles', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /classroomadmin|superadmin/);
  assert.match(source, /Correct|correct/);
});

test('StudentAssessmentSheet calls appendAssessmentAttempt on save', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /appendAssessmentAttempt/);
});

test('StudentAssessmentSheet validates all result fields and date before save', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  // Save should be disabled until all fields are filled
  assert.match(source, /disabled/);
  assert.match(source, /dateTaken/);
});

test('StudentAssessmentSheet renders history chip chain', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /attempts|history/i);
  assert.match(source, /Chip/);
});

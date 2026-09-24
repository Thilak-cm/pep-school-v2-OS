import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./StudentTimeline.jsx', import.meta.url), 'utf8');

test('student timeline renders assessments as entries opening popups (#290)', () => {
  assert.match(source, /AssessmentTimelineEntry/);
  assert.match(source, /AssessmentMatrixSheet/);
  assert.match(source, /MedicalPdfSheet/);
  // Clicking no longer navigates to the assessments page.
  assert.doesNotMatch(source, /navigateToStudentAssessments/);
});

test('student timeline shows the student result row inline with see more (2026-09-23)', () => {
  // Detailed variant: assessment name + this student's results on the card.
  assert.match(source, /details=\{\{/);
  assert.match(source, /resultDefinitions/);
  assert.match(source, /resultRows/);
  assert.match(source, /onSeeMore/);
});

test('student timeline still groups structured records by sourceId', () => {
  assert.match(source, /structuredAssessments/);
  assert.match(source, /assessmentRecordCount/);
});

test('matrix popup pins the timeline student as the focus row', () => {
  assert.match(source, /focusStudentId=\{student\?\.id\}/);
});

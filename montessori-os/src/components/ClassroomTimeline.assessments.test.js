import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./ClassroomTimeline.jsx', import.meta.url), 'utf8');

test('classroom timeline renders grouped structured assessments as one-liners (#290)', () => {
  // Structured assessments arrive as isAssessmentGroup wrappers from
  // classroomTimelineUtils; renderTimelineItem handles them before the
  // generic isGrouped branch.
  assert.match(source, /item\.isAssessmentGroup/);
  assert.match(source, /representativeNote/);
});

test('classroom timeline shows single-line assessment notifications with popup links (#290)', () => {
  assert.match(source, /uploaded \$\{rep\.assessmentName/);
  assert.match(source, /uploaded a medical assessment for/);
  assert.match(source, /AssessmentTimelineEntry/);
  assert.match(source, /AssessmentMatrixSheet/);
  assert.match(source, /MedicalPdfSheet/);
  // Clicking opens the popup in place instead of navigating away.
  assert.doesNotMatch(source, /navigateToStudentAssessments/);
});

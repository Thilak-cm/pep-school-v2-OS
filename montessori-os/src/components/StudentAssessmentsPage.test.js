import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pageUrl = new URL('./StudentAssessmentsPage.jsx', import.meta.url);

test('StudentAssessmentsPage uses authoritative metadata and view-only access', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /getStructuredAssessmentSource/);
  assert.doesNotMatch(source, /getDownloadURL/);
  // #290: View replaces downloads. The page never mints file URLs itself.
  assert.doesNotMatch(source, /getAssessmentDownloadUrl/);
  assert.doesNotMatch(source, /Download source worksheet/);
  assert.doesNotMatch(source, /Download medical PDF/);
  assert.match(source, /AssessmentMatrixSheet/);
  assert.match(source, /MedicalPdfSheet/);
});

test('StudentAssessmentsPage hides pending Medical records', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /record\.uploadStatus === 'ready'/);
});

test('StudentAssessmentsPage consumes source and record deep links', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /assessmentDeepLink\?\.sourceId/);
  assert.match(source, /assessmentDeepLink\?\.observationId/);
  assert.match(source, /scrollIntoView/);
});

test('StudentAssessmentsPage surfaces source metadata failures with retry UI', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /sourceErrors\[sourceId\]/);
  assert.match(source, /Retry source details/);
  assert.match(source, /view access could not be verified/);
});

test('StudentAssessmentsPage offers administrator-only hard delete actions', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /deleteAssessment/);
  assert.match(source, /userRole === 'superadmin' \|\| userRole === 'classroomadmin'/);
  assert.match(source, /This cannot be undone/);
  assert.match(source, /attached PDF/);
});

test('StudentAssessmentsPage confirms deletes with an all-students MUI dialog (#290)', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /<Dialog/);
  assert.match(source, /for all \$\{|removes it for all/);
});

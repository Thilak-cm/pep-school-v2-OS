import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pageUrl = new URL('./StudentAssessmentsPage.jsx', import.meta.url);

test('StudentAssessmentsPage uses authoritative metadata and unified downloads', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /getStructuredAssessmentSource/);
  assert.match(source, /getAssessmentDownloadUrl/);
  assert.match(source, /source\.canDownload/);
  assert.doesNotMatch(source, /getDownloadURL/);
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
  assert.match(source, /download access could not be verified/);
});

test('StudentAssessmentsPage offers administrator-only hard delete actions', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /deleteAssessment/);
  assert.match(source, /userRole === 'superadmin' \|\| userRole === 'classroomadmin'/);
  assert.match(source, /This cannot be undone/);
  assert.match(source, /attached PDF/);
});

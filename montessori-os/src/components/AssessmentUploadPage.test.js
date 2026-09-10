import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pageUrl = new URL('./AssessmentUploadPage.jsx', import.meta.url);

test('AssessmentUploadPage uses scoped active-student queries', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /where\('classroomId', 'in', ids\)/);
  assert.match(source, /where\('status', '==', 'active'\)/);
});

test('AssessmentUploadPage implements resumable 25 MB Medical uploads', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /uploadBytesResumable/);
  assert.match(source, /25 \* 1024 \* 1024/);
  assert.match(source, /createMedicalAssessmentUpload/);
  assert.match(source, /finalizeMedicalAssessmentUpload/);
  assert.match(source, /cancelMedicalAssessmentUpload/);
  assert.match(source, /notify\.error\('This PDF is too large to upload\.'/);
  assert.doesNotMatch(source, /Choose PDF \(up to 25 MB\)/);
});

test('AssessmentUploadPage stages standalone XLSX files instead of callable base64', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /createStructuredAssessmentUpload/);
  assert.match(source, /cancelStructuredAssessmentUpload/);
  assert.match(source, /STRUCTURED_CONTENT_TYPE/);
  assert.match(source, /uploadWithProgress\([\s\S]*selectedSheetBlob/);
  assert.doesNotMatch(source, /selectedSheetBase64/);
});

test('AssessmentUploadPage explains unsupported structured file types via toast', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /Please upload a structured assessment document in CSV or XLSX format/);
  assert.match(source, /Upload structured assessment document/);
  assert.doesNotMatch(source, /Choose CSV or XLSX/);
});

test('AssessmentUploadPage gates publication on resolved unique matches', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /allMatchesResolved/);
  assert.match(source, /duplicateMappings/);
  assert.match(source, /findStructuredAssessmentDuplicate/);
  // One-tap review model (#285): no bulk-accept or reject affordances.
  assert.doesNotMatch(source, /Accept All High Confidence/);
  assert.doesNotMatch(source, /requireUniqueBest/);
});

test('AssessmentUploadPage delegates match review to the shared component', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /import StudentMatchReview from '\.\/StudentMatchReview\.jsx'/);
  assert.match(source, /<StudentMatchReview/);
  assert.match(source, /pool=\{pooledStudents\}/);
  assert.match(source, /fullPool=\{students\}/);
});

test('AssessmentUploadPage preserves manual corrections across filter re-matching', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /manualSelections/);
  assert.match(source, /manualSelections\[result\.csvName\] \|\| result\.match/);
});

test('AssessmentUploadPage shows the prior publication date in duplicate warnings', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /Published: \{formatUploadDate\(duplicateSource\.publishedAt\)\}/);
});

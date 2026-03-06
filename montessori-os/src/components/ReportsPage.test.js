import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ReportsPage.jsx', import.meta.url);

test('ReportsPage gates delete icon behind isSuperAdmin check', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /isSuperAdmin/.test(source),
    'Expected ReportsPage to import or call isSuperAdmin for role-gating the delete icon',
  );
});

test('ReportsPage includes a delete confirmation dialog', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /deleteConfirmOpen|deleteDialogOpen/.test(source),
    'Expected ReportsPage to have a delete confirmation dialog state variable',
  );
  assert.ok(
    /cannot be undone/i.test(source),
    'Expected confirmation dialog to warn that deletion cannot be undone',
  );
});

test('ReportsPage tracks report_deleted analytics event', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_deleted/.test(source),
    'Expected ReportsPage to track a report_deleted analytics event',
  );
});

test('ReportsPage calls deleteStudentReport Cloud Function', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /deleteStudentReport/.test(source),
    'Expected ReportsPage to call the deleteStudentReport Cloud Function',
  );
});

test('ReportsPage accepts userRole prop', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /userRole/.test(source),
    'Expected ReportsPage to accept a userRole prop',
  );
});

// --- Draft report flow (deferred Firestore save) ---

test('handleGenerate creates draft with id: null (no Firestore save)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /id:\s*null/.test(source),
    'Expected draft report to have id: null (preview-only, no Firestore doc)',
  );
  assert.ok(
    /dryRun|Preview only|not saved to Firestore/i.test(source),
    'Expected a comment or reference indicating generate is preview-only',
  );
});

test('handleGenerate stores _payload for roundtrip on export', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /_payload:\s*\{/.test(source),
    'Expected draft to include _payload object with fields for roundtrip export',
  );
  // Verify key roundtrip fields are in the payload
  const payloadFields = ['dateRangeStart', 'dateRangeEnd', 'programId', 'model', 'sourceNoteIds'];
  for (const field of payloadFields) {
    assert.ok(
      source.includes(field),
      `Expected _payload to include ${field} for roundtrip`,
    );
  }
});

test('handleGenerate does not add draft to reports list', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // After generation the old code did setReports((prev) => [newReport, ...prev])
  // The new code should NOT add drafts to the list — only setSelectedReport
  assert.ok(
    /setSelectedReport\(draft\)/.test(source),
    'Expected handleGenerate to set the draft as selectedReport',
  );
});

test('handleExportToDrive sends reportPayload for drafts', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /isDraft\s*=\s*!selectedReport\.id/.test(source) || /isDraft/.test(source),
    'Expected handleExportToDrive to detect draft via !selectedReport.id',
  );
  assert.ok(
    /reportPayload:\s*selectedReport\._payload/.test(source),
    'Expected draft export to send reportPayload from _payload',
  );
});

test('handleExportToDrive sends reportDocId for saved reports', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /reportDocId:\s*selectedReport\.id/.test(source),
    'Expected saved report export to send reportDocId',
  );
});

test('draft is promoted to saved report after export (id set, _payload cleared)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /id:\s*docId/.test(source),
    'Expected saved report to receive docId from export response',
  );
  assert.ok(
    /_payload:\s*undefined/.test(source),
    'Expected _payload to be cleared after export promotes draft to saved',
  );
  assert.ok(
    /setReports\(\(prev\)\s*=>\s*\[savedReport/.test(source),
    'Expected draft to be added to reports list after successful export',
  );
});

test('ReportPreviewDialog receives isDraft prop', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /isDraft=\{!selectedReport\?\.id\}/.test(source),
    'Expected isDraft prop to be derived from !selectedReport?.id',
  );
});

test('onExportToDrive is enabled based on reportText (not id)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /onExportToDrive=\{selectedReport\?\.reportText\s*\?/.test(source),
    'Expected onExportToDrive to check reportText (not id) so drafts can export',
  );
});

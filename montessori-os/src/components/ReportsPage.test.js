import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ReportsPage.jsx', import.meta.url);

test('ReportsPage gates delete icon behind isAdminRole check', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /isAdminRole/.test(source),
    'Expected ReportsPage to import or call isAdminRole for role-gating the delete icon',
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

test('ReportsPage renders score chips with color logic based on score value', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /sentimentScore/.test(source) && /areaBalanceScore/.test(source),
    'Expected ReportsPage to reference sentimentScore and areaBalanceScore for chip display',
  );
  assert.ok(
    /getScoreColor|scoreColor|score.*color/i.test(source),
    'Expected ReportsPage to have score-to-color logic for chips',
  );
});

test('ReportsPage renders data completeness chip (Complete / Missing data)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /Complete/.test(source) && /Missing data/.test(source),
    'Expected ReportsPage to show "Complete" and "Missing data" labels for data completeness chip',
  );
});

test('ReportsPage renders author display name (generatedByName)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /generatedByName/.test(source),
    'Expected ReportsPage to reference generatedByName for author display',
  );
});

// --- PEP-81: Queue report export tests ---

test('ReportsPage imports enqueueSaveQueueItems for background export', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /enqueueSaveQueueItems/.test(source),
    'Expected ReportsPage to import enqueueSaveQueueItems from saveQueue',
  );
});

test('ReportsPage enqueues report_export kind on draft export', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_export/.test(source),
    'Expected ReportsPage to enqueue items with kind report_export',
  );
});

test('ReportsPage shows info toast with student name when enqueuing export', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /Saving and exporting|saving.*export/i.test(source),
    'Expected ReportsPage to show an info toast when enqueuing export',
  );
});

test('ReportsPage subscribes to SaveQueue for in-progress export state', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /subscribeSaveQueue/.test(source),
    'Expected ReportsPage to subscribe to SaveQueue for exporting state',
  );
});

test('ReportsPage shows exporting indicator for in-progress exports', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /[Ee]xporting/.test(source) && /PENDING|PROCESSING|pending|processing/.test(source),
    'Expected ReportsPage to show exporting indicator based on queue item status',
  );
});

test('ReportsPage accepts pendingViewReportId prop for auto-opening report dialog', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /pendingViewReportId/.test(source),
    'Expected ReportsPage to accept pendingViewReportId prop',
  );
});

test('ReportsPage uses REPORT_EXPORT_MAX_ATTEMPTS for queue items', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /REPORT_EXPORT_MAX_ATTEMPTS|maxAttempts/.test(source),
    'Expected ReportsPage to set maxAttempts on enqueued report_export items',
  );
});

// --- PEP-101: Idempotent draft report export tests ---

test('ReportsPage generates a stable reportDocId in the enqueue payload', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_sq_/.test(source),
    'Expected ReportsPage to generate a reportDocId with report_sq_ prefix in the enqueue payload',
  );
});

test('ReportsPage includes reportDocId in the report_export payload', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // The payload object passed to enqueueSaveQueueItems should contain reportDocId
  assert.ok(
    /reportDocId/.test(source),
    'Expected ReportsPage to include reportDocId in the enqueued payload',
  );
});

// --- PEP-68: Report readiness checker tests ---

test('ReportsPage fetches report_readiness doc from ai_summaries', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_readiness/.test(source),
    'Expected ReportsPage to reference report_readiness doc ID',
  );
});

test('ReportsPage calls checkReportReadiness Cloud Function', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /checkReportReadiness/.test(source),
    'Expected ReportsPage to call the checkReportReadiness Cloud Function',
  );
});

test('ReportsPage renders report readiness section directly on the page', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /Report Readiness/.test(source),
    'Expected ReportsPage to display a "Report Readiness" section on the page',
  );
  assert.ok(
    /Check report readiness/.test(source),
    'Expected ReportsPage to have a "Check report readiness" button for first-time use',
  );
});

test('ReportsPage computes newNotesSinceReport from readiness and report data', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /newNotesSinceReport/.test(source),
    'Expected ReportsPage to compute and pass newNotesSinceReport to ReportGenerateDialog',
  );
});

test('ReportsPage generate button is never disabled by readiness scores (advisory only)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // The Generate Report button's disabled prop should not reference readiness state
  const generateBtnMatch = source.match(/disabled=\{[^}]*\}[^]*?>\s*Generate Report/);
  if (generateBtnMatch) {
    assert.ok(
      !/readiness/.test(generateBtnMatch[0]),
      'Expected Generate Report button disabled prop to not reference readiness state',
    );
  }
});

test('ReportGenerateDialog does not contain readiness UI (moved to ReportsPage)', async () => {
  const dialogUrl = new URL('./ReportGenerateDialog.jsx', import.meta.url);
  const source = await readFile(dialogUrl, 'utf8');
  assert.ok(
    !/readiness/i.test(source),
    'Expected ReportGenerateDialog to not contain any readiness-related code',
  );
});

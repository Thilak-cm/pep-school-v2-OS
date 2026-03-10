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

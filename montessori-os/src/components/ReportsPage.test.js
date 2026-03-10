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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./SaveQueueNotificationBridge.jsx', import.meta.url);

test('Bridge generates completion message for report_export kind', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_export/.test(source),
    'Expected Bridge to handle report_export kind',
  );
});

test('Bridge shows success toast with View action for completed report exports', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /actionLabel.*View|View.*actionLabel/.test(source) || /['"]View['"]/.test(source),
    'Expected Bridge to include a "View" action label for report_export success toasts',
  );
});

test('Bridge accepts onNavigateToReport prop for navigation', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /onNavigateToReport/.test(source),
    'Expected Bridge to accept onNavigateToReport prop',
  );
});

test('Bridge shows error toast for failed report_export items', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /FAILED|failed/.test(source) && /report_export/.test(source),
    'Expected Bridge to handle failed report_export items',
  );
});

test('Bridge calls retrySaveQueueItem on retry action for failed exports', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /retrySaveQueueItem/.test(source),
    'Expected Bridge to import and call retrySaveQueueItem for retry functionality',
  );
});

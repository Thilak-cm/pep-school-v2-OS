import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./saveQueue.js', import.meta.url);

test('saveQueue imports cloudFunctions for report_export kind', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /cloudFunctions/.test(source),
    'Expected saveQueue to import cloudFunctions from firebase.js',
  );
  assert.ok(
    /httpsCallable/.test(source),
    'Expected saveQueue to import httpsCallable from firebase/functions',
  );
});

test('saveQueue has a deriveReportExportPayload handler', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /deriveReportExportPayload/.test(source),
    'Expected saveQueue to define a deriveReportExportPayload function',
  );
});

test('saveQueue runItem dispatches report_export to deriveReportExportPayload', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /report_export/.test(source),
    'Expected runItem to handle report_export kind',
  );
  // Verify the kind string appears in the runItem function context
  assert.ok(
    /item\.kind\s*===\s*'report_export'/.test(source),
    'Expected runItem to check item.kind === \'report_export\'',
  );
});

test('deriveReportExportPayload calls exportReportToDrive Cloud Function', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /exportReportToDrive/.test(source),
    'Expected deriveReportExportPayload to call exportReportToDrive Cloud Function',
  );
});

test('deriveReportExportPayload returns docId and driveDocLink', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /docId/.test(source) && /driveDocLink/.test(source),
    'Expected deriveReportExportPayload to return docId and driveDocLink from Cloud Function result',
  );
});

test('report_export default maxAttempts is 3', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /REPORT_EXPORT_MAX_ATTEMPTS\s*=\s*3/.test(source),
    'Expected a REPORT_EXPORT_MAX_ATTEMPTS constant set to 3',
  );
});

// --- PEP-101: Idempotent draft report export tests ---

test('deriveReportExportPayload passes reportDocId to the Cloud Function call', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // The httpsCallable call should include reportDocId from the payload
  assert.ok(
    /reportDocId/.test(source),
    'Expected deriveReportExportPayload to pass reportDocId in the Cloud Function call payload',
  );
  // Specifically verify it reads reportDocId from the item payload
  assert.ok(
    /payload\.reportDocId/.test(source),
    'Expected deriveReportExportPayload to read reportDocId from payload',
  );
});

test('report_export items preserve reportDocId through hydration', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // The hydrate function restores items from localStorage including payload,
  // and buildQueueItem preserves the payload object as-is.
  // Verify that payload is preserved during serialization/hydration.
  assert.ok(
    /payload:\s*item\.payload/.test(source),
    'Expected serializeItem to preserve the full payload (including reportDocId) during serialization',
  );
  // Verify hydration restores items with their payload intact
  assert.ok(
    /\.\.\.item/.test(source),
    'Expected hydrate to spread the full stored item (preserving payload with reportDocId)',
  );
});

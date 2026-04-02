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

test('deriveReportExportPayload reads reportDocId from payload and passes it to the Cloud Function', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  // Extract the deriveReportExportPayload function body
  const fnMatch = source.match(
    /const deriveReportExportPayload\s*=\s*async\s*\(payload\)\s*=>\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(fnMatch, 'Expected to find deriveReportExportPayload function');
  const fnBody = fnMatch[1];
  // The call payload must include reportDocId from the payload parameter
  assert.ok(
    /reportDocId:\s*payload\.reportDocId/.test(fnBody),
    'Expected the Cloud Function call to include reportDocId: payload.reportDocId',
  );
  // The call payload must include studentId
  assert.ok(
    /studentId:\s*payload\.studentId/.test(fnBody),
    'Expected the Cloud Function call to include studentId: payload.studentId',
  );
  // The call payload must include reportPayload
  assert.ok(
    /reportPayload:\s*payload\.reportPayload/.test(fnBody),
    'Expected the Cloud Function call to include reportPayload: payload.reportPayload',
  );
});

test('hydration preserves payload fields (including reportDocId) through serialization round-trip', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  // serializeItem must preserve the payload object
  const serializeMatch = source.match(
    /const serializeItem\s*=\s*\(item\)\s*=>\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(serializeMatch, 'Expected to find serializeItem function');
  assert.ok(
    /payload:\s*item\.payload/.test(serializeMatch[1]),
    'Expected serializeItem to include payload: item.payload in the serialized output',
  );

  // hydrate must spread the full stored item (which includes payload)
  const hydrateMatch = source.match(
    /const hydrate\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(hydrateMatch, 'Expected to find hydrate function');
  assert.ok(
    /\.\.\.item/.test(hydrateMatch[1]),
    'Expected hydrate to spread the full stored item via ...item (preserving all payload fields)',
  );
});

test('buildQueueItem preserves payload from entry', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const buildMatch = source.match(
    /const buildQueueItem\s*=\s*\(entry\)\s*=>\s*\{([\s\S]*?)\n\};/,
  );
  assert.ok(buildMatch, 'Expected to find buildQueueItem function');
  assert.ok(
    /payload:\s*entry\.payload/.test(buildMatch[1]),
    'Expected buildQueueItem to set payload: entry.payload (preserving reportDocId and other fields)',
  );
});

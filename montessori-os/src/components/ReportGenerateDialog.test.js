import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./ReportGenerateDialog.jsx', import.meta.url);

test('ReportGenerateDialog offers a Baseline vs Term report-type selector (PEP-325)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /reportType/.test(source),
    'Expected ReportGenerateDialog to track a reportType state',
  );
  assert.ok(
    /baseline/i.test(source) && /\bterm\b/i.test(source),
    'Expected ReportGenerateDialog to expose both Baseline and Term options',
  );
});

test('ReportGenerateDialog defaults the report type to term (PEP-325)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /useState\(\s*['"]term['"]\s*\)/.test(source),
    'Expected reportType to default to "term" so existing behavior is preserved',
  );
});

test('ReportGenerateDialog includes reportType in the onGenerate payload (PEP-325)', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.ok(
    /onGenerate\?\.\(\{[^}]*reportType/.test(source),
    'Expected onGenerate payload to include reportType',
  );
});

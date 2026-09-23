import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sheetUrl = new URL('./MedicalPdfSheet.jsx', import.meta.url);

test('MedicalPdfSheet views medical PDFs inline without download affordances (#290)', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /getAssessmentDownloadUrl/);
  assert.match(source, /<iframe/);
  // View-only: no download buttons, links, or attributes anywhere.
  assert.doesNotMatch(source, /Download medical PDF/);
  assert.doesNotMatch(source, /\bdownload=/);
});

test('MedicalPdfSheet offers a new-tab fallback for platforms without inline PDF support', async () => {
  const source = await readFile(sheetUrl, 'utf8');
  assert.match(source, /window\.open\([^)]*noopener/);
});

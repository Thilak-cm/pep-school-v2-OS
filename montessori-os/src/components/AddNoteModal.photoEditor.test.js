import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./AddNoteModal.jsx', import.meta.url), 'utf8');

test('MediaNote photo cards expose an Edit action and exclude non-photos', () => {
  assert.match(source, /aria-label="Edit photo"/);
  assert.match(source, /item\.kind === 'photo'/);
  assert.match(source, /PhotoEditor/);
});

test('edited photos clear classification and trigger isolated reanalysis', () => {
  assert.match(source, /analyzed: false/);
  assert.match(source, /runPhotoAnalysis\(unanalyzed\)/);
  assert.match(source, /Photo analysis done for newly edited image/);
  assert.match(source, /photo_editor_applied/);
  assert.match(source, /imageEdited: item\.imageEdited === true/);
});

test('photo analysis loading remains active until overlapping requests finish', () => {
  assert.match(source, /activePhotoAnalysisRef/);
  assert.match(source, /activePhotoAnalysisRef\.current\.size > 0/);
});

test('editing does not analyze until the student-selection effect is eligible', () => {
  assert.doesNotMatch(source, /runPhotoAnalysis\(\[updated\]\)/);
  assert.match(source, /selectedStudents\.length !== 1/);
});

test('MediaNote analytics uses privacy-safe aggregate fields', () => {
  for (const event of ['photo_editor_opened', 'photo_editor_applied', 'photo_editor_cancelled', 'photo_editor_apply_failed', 'media_note_created']) {
    assert.match(source, new RegExp(event));
  }
  assert.doesNotMatch(source, /trackEvent\(['"]photo_editor_[^)]*studentId/);
});

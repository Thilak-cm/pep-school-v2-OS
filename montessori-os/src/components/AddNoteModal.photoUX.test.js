import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(__dirname, 'AddNoteModal.jsx'), 'utf-8');
const pickerSource = readFileSync(join(__dirname, 'ClassroomStudentPicker.jsx'), 'utf-8');

describe('PEP-243: Photo note UX polish', () => {
  describe('AC1 — Swap-to-replace student selection', () => {
    it('handleStudentsChange does not block when photo mode has >1 student — performs swap instead', () => {
      // The old pattern: early return when nextStudents.length > 1 in photo mode
      // Should NOT exist anymore — swap logic replaces it
      const hasOldBlock = /if\s*\(\s*step\s*===\s*STEP_MEDIA\s*&&\s*mediaMode\s*===\s*'photo'\s*&&\s*nextStudents\?\.length\s*>\s*1\s*\)\s*\{[^}]*return;?\s*\}/s.test(modalSource);
      assert.ok(!hasOldBlock, 'Old blocking pattern (early return for >1 student in photo mode) should be replaced with swap logic');
    });

    it('ClassroomStudentPicker does not disable unselected rows when maxSelectable=1 and swapMode is enabled', () => {
      // The picker should support a swap mode where rows stay enabled even at the limit
      // Check that the disabled label "(only 1 student per photo note)" is removed
      assert.ok(
        !pickerSource.includes('only 1 student per photo note'),
        'Disabled label text "(only 1 student per photo note)" should be removed — swap mode means rows are never disabled'
      );
    });
  });

  describe('AC2 — No repetitive toast', () => {
    it('does not fire "Photo analysis supports one student at a time" warning', () => {
      assert.ok(
        !modalSource.includes('Photo analysis supports one student at a time'),
        'Warning toast text should be removed — swap behavior makes it unnecessary'
      );
    });
  });

  describe('AC3 — Loading box hidden behind browse toggle', () => {
    it('ClassroomStudentPicker does not render top-level "lining up" loading box', () => {
      // The old pattern: a top-level Box with "Coach Pepper is lining up classrooms and students"
      // shown outside the Browse section. Should be removed — browse section has its own loading.
      assert.ok(
        !pickerSource.includes('lining up classrooms and students'),
        'Top-level "lining up classrooms and students" loading box should be removed'
      );
    });

    it('Browse section still has its own loading state', () => {
      // The loading state inside the Collapse should remain
      assert.ok(
        pickerSource.includes('opening classrooms'),
        'Browse section should retain its own loading message inside Collapse'
      );
    });
  });

  describe('AC4 — CTA not hijacked during analysis', () => {
    it('CTA button is not disabled by photoAnalysisLoading', () => {
      // The old pattern: hasUnanalyzedPhotos in the disabled prop
      // CTA should stay enabled during analysis
      const ctaDisabledBlock = modalSource.match(/disabled=\{[\s\S]*?hasUnanalyzedPhotos[\s\S]*?\}/);
      assert.ok(
        !ctaDisabledBlock,
        'CTA disabled prop should not reference hasUnanalyzedPhotos — button stays enabled during analysis'
      );
    });

    it('CTA button text is always "Create Media Note" or "Select a student above" — never analysis text', () => {
      // The CTA ternary should only choose between needsStudent and default — no analysis branch
      const ctaTernary = modalSource.match(/\{needsStudent\s*\?[^}]+\}/);
      assert.ok(ctaTernary, 'CTA should have a needsStudent ternary');
      assert.ok(
        !ctaTernary[0].includes('Analyzing'),
        'CTA ternary should not include "Analyzing" text — analysis indicator is inline near photos'
      );
    });
  });
});

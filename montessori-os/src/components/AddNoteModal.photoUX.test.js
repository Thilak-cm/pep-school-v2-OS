import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(__dirname, 'AddNoteModal.jsx'), 'utf-8');
const pickerSource = readFileSync(join(__dirname, 'ClassroomStudentPicker.jsx'), 'utf-8');
const headerSource = readFileSync(join(__dirname, '..', 'AppHeader.jsx'), 'utf-8');
const dashboardSource = readFileSync(join(__dirname, 'StudentDashboard.jsx'), 'utf-8');

describe('PEP-243: Photo note UX polish', () => {
  describe('AC1 — Swap-to-replace student selection', () => {
    it('handleStudentsChange does not block when photo mode has >1 student — performs swap instead', () => {
      // The old pattern: early return when nextStudents.length > 1 in photo mode
      // Should NOT exist anymore — swap logic replaces it
      const hasOldBlock = /if\s*\(\s*step\s*===\s*STEP_MEDIA\s*&&\s*mediaMode\s*===\s*'photo'\s*&&\s*nextStudents\?\.length\s*>\s*1\s*\)\s*\{[^}]*return;?\s*\}/s.test(modalSource);
      assert.ok(!hasOldBlock, 'Old blocking pattern (early return for >1 student in photo mode) should be replaced with swap logic');
    });

    it('swap logic IS present — finds the new student and keeps only it', () => {
      // Positive assertion: the swap logic selects the student not already in selectedStudents
      assert.ok(
        modalSource.includes('nextStudents.find((id) => !selectedStudents.includes(id))'),
        'Swap logic should find the newly-added student by excluding already-selected ones'
      );
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

  describe('AC5 — Age moved to header', () => {
    it('AppHeader defines AGE_SCREENS with all 5 student screens', () => {
      assert.ok(headerSource.includes("AGE_SCREENS"), 'AppHeader should define AGE_SCREENS constant');
      for (const screen of ['studentDashboard', 'timeline', 'studentStats', 'studentReports', 'childChat']) {
        assert.ok(headerSource.includes(screen), `AGE_SCREENS should include '${screen}'`);
      }
    });

    it('AppHeader calls calculateAgeFromDob', () => {
      assert.ok(
        headerSource.includes('calculateAgeFromDob'),
        'AppHeader should call calculateAgeFromDob to compute age string'
      );
    });

    it('StudentDashboard does NOT render age chip in toolbar — only DoB-missing guard', () => {
      // The toolbar should use !ageString (show chip only when DoB is missing), not ageString (show age)
      const toolbarSection = dashboardSource.match(/Uniform toolbar chip row[\s\S]{0,500}/);
      assert.ok(toolbarSection, 'Should have toolbar chip row section');
      assert.ok(
        toolbarSection[0].includes('!ageString'),
        'Toolbar should guard with !ageString (DoB-missing only), not render age'
      );
    });
  });
});

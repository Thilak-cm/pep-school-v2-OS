import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(__dirname, 'AddNoteModal.jsx'), 'utf-8');

describe('PEP-283: Save button always enabled with toast guards', () => {
  describe('AC1 — Save button never disabled due to missing students', () => {
    it('Save Note button disabled prop does not reference selectedStudents.length', () => {
      // The Save Note button on STEP_RECIPIENTS should only be disabled by `saving`,
      // not by selectedStudents.length === 0
      const saveButtonPattern = /disabled=\{[^}]*selectedStudents\.length\s*===\s*0[^}]*\}/;
      assert.ok(
        !saveButtonPattern.test(modalSource),
        'Save Note button should not be disabled by selectedStudents.length === 0 — use toast guard instead'
      );
    });

    it('Save Note button is still disabled while saving', () => {
      // The button should remain disabled during save to prevent double-submit
      assert.ok(
        modalSource.includes('disabled={saving}'),
        'Save Note button should be disabled={saving} only'
      );
    });
  });

  describe('AC2 — Toast guard for no students selected', () => {
    it('handleRecipientsNext has a student-empty guard before proceeding', () => {
      // After the noteData check, there should be a guard that checks
      // selectedStudents length and calls notify.warning
      const recipientsNextBlock = modalSource.match(
        /const handleRecipientsNext\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
      );
      assert.ok(recipientsNextBlock, 'handleRecipientsNext function should exist');

      const fnBody = recipientsNextBlock[1];
      assert.ok(
        fnBody.includes('selectedStudents') && fnBody.includes('notify.warning'),
        'handleRecipientsNext should check selectedStudents and call notify.warning when empty'
      );
    });

    it('student guard returns early before getSelectedProgramIds', () => {
      // The student check must come BEFORE getSelectedProgramIds to prevent
      // proceeding with an empty student list
      const fnMatch = modalSource.match(
        /const handleRecipientsNext\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
      );
      const fnBody = fnMatch[1];
      const studentGuardIdx = fnBody.indexOf('selectedStudents.length === 0');
      const programIdsIdx = fnBody.indexOf('getSelectedProgramIds');
      assert.ok(
        studentGuardIdx > 0 && studentGuardIdx < programIdsIdx,
        'Student empty guard must appear before getSelectedProgramIds call'
      );
    });
  });

  describe('AC3 — No regression: media note path unchanged', () => {
    it('handleCreateMediaNote still has its own student guard', () => {
      assert.ok(
        modalSource.includes("notify.warning('Select at least one student.')"),
        'Media note path should retain its existing student guard with notify.warning'
      );
    });
  });
});

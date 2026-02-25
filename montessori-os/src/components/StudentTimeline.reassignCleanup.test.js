import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./StudentTimeline.jsx', import.meta.url);

const forbiddenPatterns = [
  [/const\s+handleReassignCancel\s*=/, 'handleReassignCancel'],
  [/const\s+handleReassignStudentsChange\s*=/, 'handleReassignStudentsChange'],
  [/const\s+handleReassignNext\s*=/, 'handleReassignNext'],
  [/const\s+handleConfirmReassign\s*=/, 'handleConfirmReassign'],
  [/const\s+handleCancelReassign\s*=/, 'handleCancelReassign'],
  [/\breassignSelectedStudents\b/, 'reassignSelectedStudents references'],
  [/\bsetReassignDialogOpen\b/, 'setReassignDialogOpen references'],
  [/\bsetReassignConfirmOpen\b/, 'setReassignConfirmOpen references'],
  [/\bsetReassigning\b/, 'setReassigning references'],
];

test('StudentTimeline does not contain dead reassignment handlers', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  for (const [pattern, label] of forbiddenPatterns) {
    assert.equal(
      pattern.test(source),
      false,
      `Expected ${label} to be removed from StudentTimeline.jsx`,
    );
  }
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(__dirname, 'AddNoteModal.jsx'), 'utf-8');
const appSource = readFileSync(resolve(__dirname, '..', 'App.jsx'), 'utf-8');
const bridgeSource = readFileSync(resolve(__dirname, '..', 'notifications', 'SaveQueueNotificationBridge.jsx'), 'utf-8');
const classroomTimelineSrc = readFileSync(join(__dirname, 'ClassroomTimeline.jsx'), 'utf-8');
const studentTimelineSrc = readFileSync(join(__dirname, 'StudentTimeline.jsx'), 'utf-8');

// ──────────────────────────────────────────────
// AC1: Note save is synchronous - modal waits for Firestore write
// ──────────────────────────────────────────────

describe('#129 AC1: Synchronous note save', () => {
  it('saveNote does NOT call enqueueSaveQueueItems', () => {
    // Extract saveNote function body
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    assert.ok(saveNoteMatch, 'saveNote function should exist');
    const fnBody = saveNoteMatch[1];
    assert.ok(
      !fnBody.includes('enqueueSaveQueueItems'),
      'saveNote should NOT call enqueueSaveQueueItems - must use direct Firestore writes'
    );
  });

  it('handleCreateMediaNote does NOT call enqueueSaveQueueItems', () => {
    const mediaMatch = modalSource.match(
      /const handleCreateMediaNote\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    assert.ok(mediaMatch, 'handleCreateMediaNote function should exist');
    const fnBody = mediaMatch[1];
    assert.ok(
      !fnBody.includes('enqueueSaveQueueItems'),
      'handleCreateMediaNote should NOT call enqueueSaveQueueItems - must use direct Firestore writes'
    );
  });

  it('saveNote uses setDoc for direct Firestore writes', () => {
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = saveNoteMatch[1];
    assert.ok(
      fnBody.includes('setDoc'),
      'saveNote should use setDoc for direct Firestore writes'
    );
  });

  it('does not import enqueueSaveQueueItems', () => {
    assert.ok(
      !modalSource.includes('enqueueSaveQueueItems'),
      'AddNoteModal should not import enqueueSaveQueueItems at all'
    );
  });

  it('saveNote calls onSave callback after successful write', () => {
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = saveNoteMatch[1];
    assert.ok(
      fnBody.includes('onSave'),
      'saveNote should call onSave callback after successful Firestore write'
    );
  });

  it('handleCreateMediaNote calls onSave callback after successful write', () => {
    const mediaMatch = modalSource.match(
      /const handleCreateMediaNote\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = mediaMatch[1];
    assert.ok(
      fnBody.includes('onSave'),
      'handleCreateMediaNote should call onSave callback after successful write'
    );
  });

  it('AddNoteModal accepts onSave prop', () => {
    const propMatch = modalSource.match(
      /function AddNoteModal\(\s*\{([^}]+)\}/
    );
    assert.ok(propMatch, 'AddNoteModal function declaration should exist');
    assert.ok(
      propMatch[1].includes('onSave'),
      'AddNoteModal should accept onSave prop'
    );
  });

  it('saveNote shows error toast on failure and does not close modal', () => {
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = saveNoteMatch[1];
    // On error, should show error toast
    assert.ok(
      fnBody.includes('notify.error'),
      'saveNote should call notify.error on failure'
    );
    // The catch block should only contain the error notification, not handleClose
    // Extract from '} catch' to '} finally' or end of function
    const catchMatch = fnBody.match(/\}\s*catch\s*\{([\s\S]*?)\}\s*finally/);
    assert.ok(catchMatch, 'saveNote should have a catch block');
    assert.ok(
      !catchMatch[1].includes('handleClose'),
      'saveNote catch block should NOT call handleClose - modal stays open on failure'
    );
  });
});

// ──────────────────────────────────────────────
// AC2 & AC3: Toast with "View note" button + navigation
// ──────────────────────────────────────────────

describe('#129 AC2-3: Note saved toast with View button', () => {
  it('saveNote shows success toast with View action label', () => {
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = saveNoteMatch[1];
    assert.ok(
      fnBody.includes("actionLabel") && fnBody.includes("View"),
      'saveNote should show a toast with actionLabel "View"'
    );
  });

  it('success toast has 5 second duration', () => {
    const saveNoteMatch = modalSource.match(
      /const saveNote\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\};/
    );
    const fnBody = saveNoteMatch[1];
    assert.ok(
      fnBody.includes('duration: 5000'),
      'success toast should have 5000ms (5 second) duration'
    );
  });

  it('no more "saving in the background" toast', () => {
    assert.ok(
      !modalSource.includes('saving in the background'),
      'Should not show "saving in the background" toast - save is now synchronous'
    );
  });
});

// ──────────────────────────────────────────────
// AC4 & AC5: Timeline refresh via injectNote wiring
// ──────────────────────────────────────────────

// #221 Sprint 2: injectNote removed - teachers use the refresh button instead.
// Original #129 AC4-5 tests removed since injectNote no longer exists.
describe('#221: injectNote removed, refresh button replaces it', () => {
  it('ClassroomTimeline does NOT destructure injectNote', () => {
    assert.ok(
      !classroomTimelineSrc.includes('injectNote'),
      'ClassroomTimeline should NOT reference injectNote (removed in #221)'
    );
  });

  it('StudentTimeline does NOT destructure injectNote', () => {
    assert.ok(
      !studentTimelineSrc.includes('injectNote'),
      'StudentTimeline should NOT reference injectNote (removed in #221)'
    );
  });

  it('App.jsx passes onSave prop to AddNoteModal', () => {
    assert.ok(
      appSource.includes('onSave') && appSource.includes('AddNoteModal'),
      'App.jsx should pass onSave prop to AddNoteModal'
    );
  });
});

// ──────────────────────────────────────────────
// AC6: SaveQueueNotificationBridge cleanup
// ──────────────────────────────────────────────

describe('#129 AC6: SaveQueueNotificationBridge cleanup', () => {
  it('bridge does not handle text_voice or media note completion toasts', () => {
    // The old getCompletionMessage function handled note toasts - should be removed
    assert.ok(
      !bridgeSource.includes('getCompletionMessage'),
      'SaveQueueNotificationBridge should not have getCompletionMessage - note toasts handled by AddNoteModal now'
    );
  });

  it('bridge still handles report_export completion', () => {
    assert.ok(
      bridgeSource.includes('report_export'),
      'SaveQueueNotificationBridge should still handle report_export completions'
    );
  });
});

/**
 * PEP-282: PlanFeedbackDialog component structure tests.
 *
 * Static analysis of PlanFeedbackDialog.jsx — verifies the component
 * has the required structure for difficulty/pace axes, section tags,
 * text input with mic, validation, and Firestore write path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentPath = new URL('./PlanFeedbackDialog.jsx', import.meta.url);

describe('PlanFeedbackDialog component (PEP-282)', () => {
  it('exports a default function PlanFeedbackDialog', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /export\s+default\s+function\s+PlanFeedbackDialog/.test(src),
      'Should export default function PlanFeedbackDialog',
    );
  });

  it('accepts open, onClose, studentId, and planMonth props', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/\bopen\b/.test(src), 'Should accept open prop');
    assert.ok(/\bonClose\b/.test(src), 'Should accept onClose prop');
    assert.ok(/\bstudentId\b/.test(src), 'Should accept studentId prop');
    assert.ok(/\bplanMonth\b/.test(src), 'Should accept planMonth prop');
  });

  it('has difficulty axis with three options', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/too.?easy/i.test(src), 'Should have "Too easy" option');
    assert.ok(/about.?right/i.test(src), 'Should have "About right" option');
    assert.ok(/too.?tough/i.test(src), 'Should have "Too tough" option');
  });

  it('has pace axis with three options', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/too.?slow/i.test(src), 'Should have "Too slow" option');
    assert.ok(/good.?pace/i.test(src), 'Should have "Good pace" option');
    assert.ok(/too.?fast/i.test(src), 'Should have "Too fast" option');
  });

  it('has section tag chips including General and all 5 Montessori areas', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(/General/i.test(src), 'Should have General section tag');
    assert.ok(/Language/.test(src), 'Should have Language section tag');
    assert.ok(/Sensorial/.test(src), 'Should have Sensorial section tag');
    assert.ok(/Math/.test(src), 'Should have Math section tag');
    assert.ok(/Practical Life/.test(src), 'Should have Practical Life section tag');
    assert.ok(/Grace.*Courtesy/i.test(src), 'Should have Grace & Courtesy section tag');
  });

  it('has a text input field', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /TextField|textarea|textInput/i.test(src),
      'Should have a text input field',
    );
  });

  it('references VoiceRecorder for mic input', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /VoiceRecorder/.test(src),
      'Should reference VoiceRecorder component for STT',
    );
  });

  it('has submit button', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /Submit|submit/i.test(src),
      'Should have a submit button',
    );
  });

  it('has validation requiring at least one of difficulty, pace, or text', async () => {
    const src = await readFile(componentPath, 'utf8');
    // Validation: submit disabled or guarded when all three are empty
    assert.ok(
      /difficulty.*pace.*text|!difficulty.*!pace.*!text|canSubmit|isValid/i.test(src),
      'Should have validation logic requiring at least one input',
    );
  });

  it('writes to correct Firestore feedback subcollection path', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /ai_summaries.*monthly_plan.*feedback|monthly_plan.*feedback/.test(src),
      'Should reference ai_summaries/monthly_plan/feedback Firestore path',
    );
  });

  it('uses Dialog or SwipeableDrawer for bottom sheet', async () => {
    const src = await readFile(componentPath, 'utf8');
    assert.ok(
      /Dialog|SwipeableDrawer|Drawer/.test(src),
      'Should use Dialog or Drawer for the bottom sheet',
    );
  });
});

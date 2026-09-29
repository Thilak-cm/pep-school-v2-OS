/**
 * Source-inspection tests for useInlineVoice guardrails (#304).
 * Run: node --test src/hooks/useInlineVoice.test.js
 *
 * Follows the repo's hook-test pattern (see useAlertBus.test.js): hooks can't
 * render under node --test without a DOM, so we assert on source structure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'useInlineVoice.js'), 'utf-8');

describe('useInlineVoice — minimum recording duration floor (#304)', () => {
  it('captures a wall-clock start timestamp via Date.now() ref', () => {
    assert.ok(
      /recordStartRef/.test(source) && /Date\.now\(\)/.test(source),
      'Should capture Date.now() into a recordStartRef at record start'
    );
  });

  it('enforces a 1000ms minimum duration', () => {
    assert.ok(
      source.includes('MIN_RECORDING_MS = 1000'),
      'Should define MIN_RECORDING_MS = 1000'
    );
    assert.ok(
      source.includes('MIN_RECORDING_MS'),
      'Should check elapsed time against MIN_RECORDING_MS'
    );
  });

  it('discards too-short recordings via the discard path (no upload, no CF call)', () => {
    assert.ok(
      /MIN_RECORDING_MS[\s\S]{0,200}discardRef\.current = true/.test(source),
      'Too-short stop should set discardRef before stopping the recorder'
    );
  });

  it('toasts the minimum-duration warning via useNotify', () => {
    assert.ok(
      source.includes("useNotify"),
      'Hook should import/use useNotify for the toast'
    );
    assert.ok(
      source.includes('Minimum recording time is 1 second'),
      'Should show the exact minimum-duration warning copy'
    );
    assert.ok(
      /notify\.warning\(\s*'Minimum recording time is 1 second'/.test(source),
      'Warning must use notify.warning (transient nudge, not error state)'
    );
  });

  it('keeps the existing 1KB blob size check unchanged', () => {
    assert.ok(
      source.includes('blob.size < 1024'),
      'The 1KB minimum blob size check must remain'
    );
  });

  it('uses the unified empty-transcript message', () => {
    assert.ok(
      source.includes("Couldn't hear any speech - please try recording again"),
      'Empty transcript should show the unified message'
    );
    assert.ok(
      !source.includes('No speech detected in the recording.'),
      'Old empty-transcript copy must be gone'
    );
  });
});

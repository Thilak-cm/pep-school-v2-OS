// Lightweight tests for coach parse logic using Node's built-in test runner.
// Run from project root `montessori-os` with: `npm test` (configured to `node --test`).

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCoachResponse, makeCoachRequest, isValidCoachResponse } from './coachIO.js';
import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS, MAX_NUDGES } from './constants.js';

test('parseCoachResponse clamps to MAX_NUDGES and de-dupes', () => {
  const raw = {
    nudges: [
      { id: NUDGE_IDS.DURATION, confidence: 1, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.DURATION], chips: CHIPS[NUDGE_IDS.DURATION], metadata: { duration_range: '10–20m' } },
      { id: NUDGE_IDS.MODALITY, confidence: 1, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.MODALITY], chips: CHIPS[NUDGE_IDS.MODALITY], metadata: { modality: 'Material' } },
      { id: NUDGE_IDS.INDEPENDENCE, confidence: 1, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.INDEPENDENCE], chips: CHIPS[NUDGE_IDS.INDEPENDENCE], metadata: { independence: 'Independent' } },
      { id: NUDGE_IDS.DURATION, confidence: 0.9, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.DURATION], chips: CHIPS[NUDGE_IDS.DURATION], metadata: { duration_range: '<5m' } },
    ],
  };
  const out = parseCoachResponse(raw);
  assert.ok(Array.isArray(out.nudges));
  assert.ok(out.nudges.length <= MAX_NUDGES);
  const ids = out.nudges.map((n) => n.id);
  // No duplicates
  assert.equal(new Set(ids).size, ids.length);
});

test('parseCoachResponse drops bad ids and invalid chips', () => {
  const raw = {
    nudges: [
      { id: 'not-a-real-id', confidence: 0.5, microcopy_key: 'x', chips: ['bad'], metadata: {} },
      { id: NUDGE_IDS.DURATION, confidence: 1, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.DURATION], chips: ['<5m', 'not-allowed'], metadata: { duration_range: '<5m' } },
    ],
  };
  const out = parseCoachResponse(raw);
  assert.equal(out.nudges.length, 1);
  assert.equal(out.nudges[0].id, NUDGE_IDS.DURATION);
  assert.deepEqual(out.nudges[0].chips, ['<5m']);
});

test('parseCoachResponse enforces microcopy key and SUBJECTIVE chips are empty', () => {
  const raw = {
    nudges: [
      { id: NUDGE_IDS.SUBJECTIVE, confidence: 0.7, microcopy_key: 'WRONG', chips: ['anything'], metadata: { objective_line: 'One objective line' } },
    ],
  };
  const out = parseCoachResponse(raw);
  assert.equal(out.nudges.length, 1);
  assert.equal(out.nudges[0].microcopy_key, MICROCOPY_KEYS[NUDGE_IDS.SUBJECTIVE]);
  assert.deepEqual(out.nudges[0].chips, []);
});

test('parseCoachResponse handles malformed JSON safely', () => {
  const out = parseCoachResponse('{ not-json ');
  assert.deepEqual(out, { nudges: [] });
});

test('makeCoachRequest builds safe context', () => {
  const req = makeCoachRequest('Hello', { subject_tags: ['Math', 42, null], student_age_band: null, class_name: 123 });
  assert.equal(req.note_text, 'Hello');
  assert.deepEqual(req.context.subject_tags, ['Math']);
  assert.equal(req.context.class_name, null);
});

test('isValidCoachResponse basic shape check', () => {
  const good = parseCoachResponse({
    nudges: [
      { id: NUDGE_IDS.DURATION, confidence: 0.5, microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.DURATION], chips: CHIPS[NUDGE_IDS.DURATION], metadata: { duration_range: '10–20m' } },
    ]
  });
  assert.equal(isValidCoachResponse(good), true);

  const bad = { nudges: [{ id: 'nope', confidence: 'x' }] };
  assert.equal(isValidCoachResponse(bad), false);
});

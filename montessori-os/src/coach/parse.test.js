// Lightweight tests for coach parse logic using Node's built-in test runner.
// Run from project root `montessori-os` with: `npm test` (configured to `node --test`).

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCoachResponse, makeCoachRequest, isValidCoachResponse } from './coachIO.js';
import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS, MAX_NUDGES } from './constants.js';

test('parseCoachResponse clamps to MAX_NUDGES and de-dupes', () => {
  const raw = {
    nudges: [
      { id: NUDGE_IDS.DURATION, reason: 'r1', confidence: 1 },
      { id: NUDGE_IDS.MODALITY, reason: 'r2', confidence: 1 },
      { id: NUDGE_IDS.INDEPENDENCE, reason: 'r3', confidence: 1 },
      { id: NUDGE_IDS.DURATION, reason: 'dup', confidence: 0.9 },
    ],
  };
  const out = parseCoachResponse(raw);
  assert.ok(Array.isArray(out.nudges));
  assert.ok(out.nudges.length <= MAX_NUDGES);
  const ids = out.nudges.map((n) => n.id);
  // No duplicates
  assert.equal(new Set(ids).size, ids.length);
});

test('parseCoachResponse drops bad ids and fills chips from constants', () => {
  const raw = {
    nudges: [
      { id: 'not-a-real-id', reason: 'x', confidence: 0.5 },
      { id: NUDGE_IDS.DURATION, reason: 'ok', confidence: 1 },
    ],
  };
  const out = parseCoachResponse(raw);
  assert.equal(out.nudges.length, 1);
  assert.equal(out.nudges[0].id, NUDGE_IDS.DURATION);
  assert.deepEqual(out.nudges[0].chips, CHIPS[NUDGE_IDS.DURATION]);
});

test('parseCoachResponse enriches microcopy and SUBJECTIVE chips are empty', () => {
  const raw = {
    nudges: [
      { id: NUDGE_IDS.SUBJECTIVE, reason: 'r', confidence: 0.7 },
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

test('makeCoachRequest builds minimal payload', () => {
  const req = makeCoachRequest('Hello', { classroomId: 'allstars', programId: 123 });
  assert.equal(req.note_text, 'Hello');
  assert.equal(Object.prototype.hasOwnProperty.call(req, 'context'), false);
});

test('isValidCoachResponse basic shape check', () => {
  const good = parseCoachResponse({
    nudges: [
      { id: NUDGE_IDS.DURATION, reason: 'ok', confidence: 0.5 },
    ]
  });
  assert.equal(isValidCoachResponse(good), true);

  const bad = { nudges: [{ id: 'nope', reason: 'x', confidence: 'x' }] };
  assert.equal(isValidCoachResponse(bad), false);
});

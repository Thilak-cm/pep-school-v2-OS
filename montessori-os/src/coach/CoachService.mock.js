// Mocked Coach review service for Milestone 1 UI scaffolding.
// Simulates an LLM response with up to 2 nudges based on simple cues.

import { NUDGE_IDS, MICROCOPY_KEYS, CHIPS } from './constants';

function containsAny(text, words) {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve(), ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

export async function reviewNote(noteText, context = {}, opts = {}) {
  const { signal } = opts;
  // Simulate latency 200–900ms
  await delay(200 + Math.floor(Math.random() * 700), signal);

  const lower = (noteText || '').toLowerCase();
  const nudges = [];

  // Heuristic: activity cues → Duration + Modality
  const activityCues = ['worked on', 'practiced', 'used', 'played with', 'engaged with', 'did', 'completed', 'traced', 'solved'];
  const mathCues = ['number rods', 'golden beads', 'bead frame', 'add', 'subtract', 'place value', 'fraction', 'stamp game'];
  const independenceCues = ['peer', 'pair', 'small group', 'teacher'];
  const subjectiveCues = ['always', 'never', 'lazy', 'naughty', 'careless', 'hyper', 'happy', 'sad', 'tired', 'confused', 'good', 'bad'];

  if (containsAny(lower, activityCues)) {
    nudges.push({
      id: NUDGE_IDS.DURATION,
      reason: 'Activity noted without a time range.',
      confidence: 0.8,
      microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.DURATION],
      chips: CHIPS[NUDGE_IDS.DURATION],
      append_line: 'Duration: 10–20 min',
      metadata: { duration_range: '10–20m' },
    });
    // If math-related, add Modality next
    const modality = containsAny(lower, mathCues) ? 'Material' : 'Pen & paper';
    nudges.push({
      id: NUDGE_IDS.MODALITY,
      reason: 'Work noted without modality context.',
      confidence: 0.6,
      microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.MODALITY],
      chips: CHIPS[NUDGE_IDS.MODALITY],
      append_line: `Modality: ${modality}`,
      metadata: { modality },
    });
  } else if (containsAny(lower, independenceCues)) {
    nudges.push({
      id: NUDGE_IDS.INDEPENDENCE,
      reason: 'No independence/grouping label present.',
      confidence: 0.65,
      microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.INDEPENDENCE],
      chips: CHIPS[NUDGE_IDS.INDEPENDENCE],
      append_line: 'Independence: Peer pair',
      metadata: { independence: 'Peer pair' },
    });
  } else if (containsAny(lower, ['mastered', 'struggled', 'improved', 'identified', 'grasped'])) {
    nudges.push({
      id: NUDGE_IDS.EVIDENCE,
      reason: 'Claim without count or quote.',
      confidence: 0.75,
      microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.EVIDENCE],
      chips: CHIPS[NUDGE_IDS.EVIDENCE],
      append_line: 'Evidence: 3/3 correct',
      metadata: { evidence_attempts: 3, evidence_correct: 3 },
    });
  } else if (containsAny(lower, subjectiveCues)) {
    nudges.push({
      id: NUDGE_IDS.SUBJECTIVE,
      reason: 'Adjective can be replaced by one objective observation.',
      confidence: 0.6,
      microcopy_key: MICROCOPY_KEYS[NUDGE_IDS.SUBJECTIVE],
      chips: [],
      append_line: 'Objective note: Used material and recorded 2/3 correct.',
      metadata: { objective_line: 'Used material and recorded 2/3 correct.' },
    });
  }

  return { nudges };
}

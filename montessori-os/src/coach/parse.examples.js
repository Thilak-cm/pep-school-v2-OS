// Developer-only examples for quick sanity checks of parseCoachResponse.
// Run with: node -e "import('./montessori-os/src/coach/parse.examples.js')"

import { parseCoachResponse } from './parse';

const ex1 = {
  nudges: [
    {
      id: 'duration',
      reason: 'Activity noted without a time range.',
      confidence: 0.88,
      microcopy_key: 'about_how_long',
      chips: ['<5m', '5–10m', '10–20m', '20m+'],
      append_line: 'Duration: 10–20 min',
      metadata: { duration_range: '10–20m' },
    },
    {
      id: 'modality',
      reason: 'Math work without modality context.',
      confidence: 0.62,
      microcopy_key: 'how_was_this_done',
      chips: ['Material', 'Pen & paper', 'Mental'],
      append_line: 'Modality: Material',
      metadata: { modality: 'Material' },
    },
  ],
};

const exBad = {
  nudges: [
    { id: 'unknown', confidence: 1, reason: 'x', microcopy_key: 'y', chips: [], append_line: '', metadata: {} },
    { id: 'evidence', confidence: 1.5, reason: 123, microcopy_key: 'add_tiny_evidence', chips: ['# attempts', 'WRONG'], append_line: 5, metadata: { evidence_attempts: 3, evidence_correct: 3 } },
    { id: 'subjective', confidence: 0.5, reason: 'ok', microcopy_key: 'objective_line_invite', chips: ['not allowed'], append_line: 'Objective note: ...', metadata: { objective_line: '...' } },
  ],
};

console.log('ex1 =>', JSON.stringify(parseCoachResponse(ex1)));
console.log('exBad =>', JSON.stringify(parseCoachResponse(exBad)));


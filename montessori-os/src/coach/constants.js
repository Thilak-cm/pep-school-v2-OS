// Coach constants — chip labels and IDs must match PRD exactly.

// Nudge IDs (canonical)
export const NUDGE_IDS = Object.freeze({
  DURATION: 'duration',
  MODALITY: 'modality',
  INDEPENDENCE: 'independence',
  EVIDENCE: 'evidence',
  SUBJECTIVE: 'subjective',
});

// Microcopy keys by nudge type
export const MICROCOPY_KEYS = Object.freeze({
  [NUDGE_IDS.DURATION]: "Looks like you're talking about an activity. What was its duration?",
  [NUDGE_IDS.MODALITY]: "Any specific material used during this activity?",
  [NUDGE_IDS.INDEPENDENCE]: "In what setting was this activity conducted?", // per PRD; may split later
  [NUDGE_IDS.EVIDENCE]: "Please add some evidence to this observation if you can",
  [NUDGE_IDS.SUBJECTIVE]: "Let's make this into an objective observation",
});

// Chips per category — exact strings, order matters.
export const CHIPS = Object.freeze({
  [NUDGE_IDS.DURATION]: Object.freeze(['<5m', '5–10m', '10–20m', '20m+']),
  [NUDGE_IDS.MODALITY]: Object.freeze(['Material', 'Pen & paper', 'Mental']),
  [NUDGE_IDS.INDEPENDENCE]: Object.freeze([
    'Independent',
    'Peer pair',
    'Small group',
    'Teacher-guided',
  ]),
  [NUDGE_IDS.EVIDENCE]: Object.freeze(['# attempts', '# correct', 'Add quote']),
  [NUDGE_IDS.SUBJECTIVE]: Object.freeze([]),
});

// Utility: get allowed chips for a nudge id
export function chipsFor(id) {
  return CHIPS[id] || Object.freeze([]);
}

// Coach configuration for manual nudge control (scaffolding without intelligence)
// Edit `FORCED_NUDGES` to control which nudges show in the popup.
// If more than MAX_NUDGES are listed, they will be trimmed by priority order.

import { NUDGE_IDS } from './constants';

// Default: show only Duration (you can change this)
export const FORCED_NUDGES = [
  NUDGE_IDS.DURATION,
  // Example: enable more when needed
  // NUDGE_IDS.MODALITY,
  NUDGE_IDS.INDEPENDENCE,
  // NUDGE_IDS.EVIDENCE,
  NUDGE_IDS.SUBJECTIVE,
];


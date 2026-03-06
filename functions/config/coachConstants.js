// Shared constants for Coach feature
// This file is the single source of truth that both frontend and backend reference
// functions/index.js imports COACH_MODEL_INFO from here
// montessori-os/src/components/AICoachEditor.jsx imports COACH_MODEL_DISPLAY from here
import { FRONTIER_MODEL } from "./modelConstants.js";

export const COACH_MODEL_INFO = {
  model: FRONTIER_MODEL,
  temperature: 0,
  max_tokens: 1000
};

// For display purposes
export const COACH_MODEL_DISPLAY = COACH_MODEL_INFO.model;


// Frontend shim re-exporting the single source of truth used by Cloud Functions.
// This keeps model config centralized under functions/config while allowing the
// web app to import via repo-root path `config/coachConstants`.
export { COACH_MODEL_INFO, COACH_MODEL_DISPLAY } from '../functions/config/coachConstants.js';


// Frontend shim re-exporting the single source of truth used by Cloud Functions.
// This keeps model config centralized under functions/config while allowing the
// web app to import via repo-root path `scripts/config/coachConstants`.
export { COACH_MODEL_INFO } from '../../functions/config/coachConstants.js';

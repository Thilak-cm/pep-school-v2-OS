/**
 * Pure helpers for the push-langfuse-sampling script (#298).
 *
 * Firebase-free so they can be unit tested directly (node --test),
 * same pattern as push-model-registry.helpers.mjs.
 */

// #298 decision: 0.1 for the two junk-volume features, nothing else.
// Tier-2 features (digest, chat, reports, structuredLLM roots, testbench)
// ignore config rates by design - do not add them here.
export const DESIRED_RATES = {
  text_cleanup: 0.1,
  whisper_translate: 0.1,
};

/**
 * Validate a rates map. Returns an array of error strings (empty = valid).
 */
export function validateRates(rates) {
  const errors = [];
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
    errors.push("rates must be a plain object");
    return errors;
  }
  for (const [key, value] of Object.entries(rates)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      errors.push(`${key}: invalid rate "${value}" (must be a number in [0, 1])`);
    }
  }
  return errors;
}

/**
 * Diff local desired rates against the remote doc ({ rates: {...} } or null).
 * @returns {{ added: string[], changed: string[], removed: string[], unchanged: string[] }}
 */
export function diffRates(local, remote) {
  const remoteRates = remote?.rates || {};
  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];

  for (const key of Object.keys(local)) {
    if (!(key in remoteRates)) added.push(key);
    else if (remoteRates[key] !== local[key]) changed.push(key);
    else unchanged.push(key);
  }
  for (const key of Object.keys(remoteRates)) {
    if (!(key in local)) removed.push(key);
  }
  return { added, changed, removed, unchanged };
}

/**
 * Format the diff for terminal display. Identifies exact keys and rates
 * (sampling rates are not sensitive values).
 */
export function formatRatesDiff(diff, local, remote) {
  const remoteRates = remote?.rates || {};
  const lines = [];
  for (const key of diff.added) {
    lines.push(`  + ${key}: (new) -> ${local[key]}`);
  }
  for (const key of diff.changed) {
    lines.push(`  ~ ${key}: ${remoteRates[key]} -> ${local[key]}`);
  }
  for (const key of diff.removed) {
    lines.push(`  - ${key}: ${remoteRates[key]} -> (removed)`);
  }
  for (const key of diff.unchanged) {
    lines.push(`  = ${key}: ${local[key]}`);
  }
  if (!lines.length) lines.push("  (no rates)");
  return lines.join("\n");
}

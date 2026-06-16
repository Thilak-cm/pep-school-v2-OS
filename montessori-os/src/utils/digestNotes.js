/**
 * Parse/serialize helpers for the weekly digest contextualNotes field.
 * The field is stored in Firestore as a newline-delimited string where
 * each line is prefixed with "- ". The UI works with a plain string array.
 */

/**
 * Split a newline-delimited contextualNotes string into an array of items.
 * Each line may optionally start with "- ".
 */
export function parseNotes(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Join an array of plain-text items into the contextualNotes string format.
 */
export function serializeNotes(items) {
  return items.filter(Boolean).map((item) => `- ${item.trim()}`).join('\n');
}

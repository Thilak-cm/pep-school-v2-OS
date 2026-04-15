/**
 * Utility helpers for displaying photoAnalysis data on timelines (PEP-33).
 */

/**
 * Truncate a description string to maxLen characters, adding ellipsis if needed.
 * Returns empty string for falsy input.
 */
export function truncateDescription(text, maxLen = 80) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + '…';
}

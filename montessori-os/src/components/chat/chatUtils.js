/**
 * Pure utility functions for the ChildChat feature.
 * Extracted for testability (no JSX dependencies).
 */

export const stripQuotes = (text) => {
  if (!text) return text;
  return text.replace(/^["']|["']$/g, '');
};

/**
 * Defensive timeout duration (ms) for the assistant "thinking" indicator.
 * After this period, assistantPending is cleared and a fallback message shown.
 */
export const ASSISTANT_TIMEOUT_MS = 30_000;

const INLINE_PATTERNS = [
  { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },
  { regex: /\*([^*]+)\*/g, type: 'italic' },
  { regex: /`([^`]+)`/g, type: 'code' },
];

/**
 * Collect inline markdown matches (bold, italic, code) from text.
 * Returns sorted, non-overlapping match descriptors.
 */
export const collectInlineMatches = (text) => {
  if (!text) return [];

  const matches = [];
  INLINE_PATTERNS.forEach((pattern) => {
    // Reset lastIndex since regexes are reused with /g flag
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        content: match[1],
      });
    }
  });

  matches.sort((a, b) => a.start - b.start);

  const filtered = [];
  matches.forEach((match) => {
    const overlaps = filtered.some(
      (m) => match.start < m.end && match.end > m.start
    );
    if (!overlaps) {
      filtered.push(match);
    }
  });

  return filtered;
};

/**
 * Classify a line of text for block-level markdown rendering.
 * Returns { type, content } where type is 'h1'|'h2'|'h3'|'ul'|'ol'|'blank'|'paragraph'.
 */
/**
 * Determine whether the Cloud Function should skip writing the assistant
 * message because the user pressed Stop after the request started.
 *
 * @param {object|null} cancelledResponseAt  Firestore Timestamp (or null)
 * @param {number} requestStartedAtMs  epoch-ms when the CF began processing
 * @returns {boolean} true → skip the write
 */
export const shouldSkipCancelledResponse = (cancelledResponseAt, requestStartedAtMs) => {
  if (!cancelledResponseAt) return false;
  const cancelledMs = cancelledResponseAt.toMillis?.()
    ?? (cancelledResponseAt.seconds != null ? cancelledResponseAt.seconds * 1000 : 0);
  return cancelledMs > requestStartedAtMs;
};

export const classifyLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return { type: 'blank', content: '' };
  if (trimmed.startsWith('### ')) return { type: 'h3', content: trimmed.replace(/^###\s+/, '') };
  if (trimmed.startsWith('## ')) return { type: 'h2', content: trimmed.replace(/^##\s+/, '') };
  if (trimmed.startsWith('# ')) return { type: 'h1', content: trimmed.replace(/^#\s+/, '') };
  if (trimmed.match(/^[-*]\s+/)) return { type: 'ul', content: trimmed.replace(/^[-*]\s+/, '') };
  if (trimmed.match(/^\d+\.\s+/)) return { type: 'ol', content: trimmed.replace(/^\d+\.\s+/, '') };
  return { type: 'paragraph', content: trimmed };
};

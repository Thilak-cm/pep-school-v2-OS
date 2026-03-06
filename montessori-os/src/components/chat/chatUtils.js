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

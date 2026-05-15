/**
 * Pure helper functions for pipeline components (PEP-216).
 * Separated from JSX so they can be tested with node:test.
 */

export function resolveContextBlockStatus(content, explicitCharCount) {
  const hasContent = content != null && content !== "";
  if (!hasContent) return { status: "unavailable", charCount: null };
  return {
    status: "available",
    charCount: explicitCharCount != null ? explicitCharCount : content.length,
  };
}

export function formatCharCount(charCount) {
  if (charCount == null) return "loaded";
  return `${charCount.toLocaleString()} chars`;
}

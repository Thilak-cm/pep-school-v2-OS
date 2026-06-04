/**
 * Heatmap severity/flag mapping utilities.
 * Extracted so they can be imported in both NotificationsPage.jsx and tests.
 */

export const FLAG_SORT_ORDER = { 'r': 0, 'y': 1, 'b': 2, 'g': 3 };

export const flagSortValue = (f) => FLAG_SORT_ORDER[f] ?? 4; // null/missing = lowest priority

export const severityToFlag = (severity) => {
  if (!severity || severity === 'clear') return 'g';
  if (severity === 'low') return 'b';
  if (severity === 'medium' || severity === 'med') return 'y';
  if (severity === 'high') return 'r';
  return 'g';
};

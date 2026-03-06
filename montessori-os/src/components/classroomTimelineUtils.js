/**
 * Pure utility functions extracted from ClassroomTimeline for testability.
 */

/**
 * Convert a Firestore-like timestamp to a JS Date.
 */
export function toDate(ts) {
  if (!ts) return new Date(0);
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

/**
 * Merge grouped and ungrouped timeline items, sort by date, paginate,
 * and bucket into time periods (today / last7Days / beyond).
 *
 * @param {Array} grouped  - Array of group objects with earliestObservedAt
 * @param {Array} ungrouped - Array of individual observation objects
 * @param {number} limit - Max items to display
 * @param {Date} [now] - Current time (injectable for tests)
 * @returns {{ today: Array, last7Days: Array, beyond: Array }}
 */
export function paginateTimelineItems(grouped, ungrouped, limit, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Build a unified list with a common sortDate for each item
  const merged = [];

  for (const group of grouped) {
    merged.push({
      ...group,
      isGrouped: true,
      _sortDate: group.earliestObservedAt,
    });
  }

  for (const note of ungrouped) {
    merged.push({
      ...note,
      isGrouped: false,
      _sortDate: toDate(note.observedAt || note.timestamp),
    });
  }

  // Sort newest first
  merged.sort((a, b) => b._sortDate - a._sortDate);

  // Take the first `limit` items, then bucket into time periods
  const buckets = { today: [], last7Days: [], beyond: [] };

  for (let i = 0; i < Math.min(merged.length, limit); i++) {
    const item = merged[i];
    const d = item._sortDate;

    if (d >= today) buckets.today.push(item);
    else if (d >= lastWeek) buckets.last7Days.push(item);
    else buckets.beyond.push(item);
  }

  return buckets;
}

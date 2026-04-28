/**
 * InterviewsPage helpers — filter and formatting functions.
 * Will be populated with real Firestore logic when PEP-122 (scheduling) lands.
 *
 * Note: Firestore interview status is 'active' | 'completed' | 'abandoned'
 * (see DATA_STRUCTURE.md). UI-layer statuses ('upcoming', 'scheduled') are
 * derived by PEP-122's scheduling logic, not stored in Firestore.
 */

/**
 * Partition interviews into upcoming and completed lists.
 * @param {Array} interviews
 * @returns {{ upcoming: Array, completed: Array }}
 */
export function partitionInterviews(interviews) {
  const upcoming = [];
  const completed = [];
  for (const item of interviews) {
    if (item.status === 'completed') {
      completed.push(item);
    } else {
      upcoming.push(item);
    }
  }
  return { upcoming, completed };
}

/**
 * Get interviews that have an active alert flag.
 * @param {Array} interviews
 * @returns {Array}
 */
export function getAlertInterviews(interviews) {
  return interviews.filter((i) => i.hasAlert === true);
}

/**
 * Format "last interviewed" as a relative day string.
 * @param {string|null} isoDate
 * @returns {string}
 */
export function formatLastInterviewed(isoDate) {
  if (!isoDate) return 'Never interviewed';
  const then = new Date(isoDate);
  if (isNaN(then.getTime())) return 'Never interviewed';
  const now = new Date();
  const diffMs = now - then;
  if (diffMs < 0) return 'Upcoming';
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

import { formatDate } from './dateFormat';

/**
 * Normalize a Firestore timestamp or Date to a JS Date.
 */
function toDate(ts) {
  if (!ts) return new Date(0);
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

/**
 * Get a calendar date key (YYYY-MM-DD) from a timestamp.
 */
function dateKey(ts) {
  const d = toDate(ts);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Group report entries by calendar date for the classroom timeline.
 * Returns an array of { date, dateLabel, reports } sorted by date descending.
 *
 * @param {Array} reports - Array of report objects with at least { generatedAt }
 * @returns {Array<{ date: Date, dateLabel: string, reports: Array }>}
 */
export function groupReportsByDate(reports) {
  if (!reports || !reports.length) return [];

  const groups = {};

  for (const report of reports) {
    const key = dateKey(report.generatedAt);
    if (!groups[key]) {
      groups[key] = {
        key,
        date: toDate(report.generatedAt),
        dateLabel: formatDate(report.generatedAt),
        reports: [],
      };
    }
    groups[key].reports.push(report);
  }

  // Sort groups by date descending (newest first)
  return Object.values(groups).sort((a, b) => b.date - a.date);
}

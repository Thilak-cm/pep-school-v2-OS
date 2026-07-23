/**
 * Pure helpers for useTimelineStats (#221 Sprint 2).
 * Separated from the hook so they can be tested without Firebase.
 */

/**
 * Sum the last 7 daily entries from effortActivity.daily.
 * Keys are "YYYY-MM-DD" strings; we sort descending and take 7.
 */
export function sumLast7Days(daily) {
  if (!daily || typeof daily !== 'object') return 0;
  const entries = Object.entries(daily);
  entries.sort((a, b) => b[0].localeCompare(a[0])); // newest first
  return entries.slice(0, 7).reduce((sum, [, count]) => sum + (count || 0), 0);
}

/**
 * Find a student's stats in the statsCache students[] array.
 * Returns { totalMentions, thisWeekMentions } or zeroes if not found.
 */
export function findStudentStats(students, studentId) {
  if (!Array.isArray(students) || !studentId) {
    return { totalMentions: 0, thisWeekMentions: 0 };
  }
  const match = students.find(s => s.id === studentId);
  if (!match) return { totalMentions: 0, thisWeekMentions: 0 };
  return {
    totalMentions: match.totalMentions || 0,
    thisWeekMentions: match.thisWeekMentions || 0,
  };
}

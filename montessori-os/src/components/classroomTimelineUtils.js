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
    const { _sortDate, ...cleanItem } = merged[i];
    const d = _sortDate;

    if (d >= today) buckets.today.push(cleanItem);
    else if (d >= lastWeek) buckets.last7Days.push(cleanItem);
    else buckets.beyond.push(cleanItem);
  }

  return buckets;
}

/**
 * Group timeline items by calendar day, newest day first.
 * Each item's date is derived from observedAt, earliestObservedAt (grouped), or timestamp.
 *
 * @param {Array} items - Merged list of ungrouped notes + grouped note objects
 * @returns {Array<{ dateKey: string, date: Date, label: string, items: Array }>}
 */
export function groupByCalendarDay(items) {
  if (!items.length) return [];

  const dayMap = new Map();

  for (const item of items) {
    let d;
    if (item.isGrouped && item.earliestObservedAt) {
      d = item.earliestObservedAt instanceof Date
        ? item.earliestObservedAt
        : toDate(item.earliestObservedAt);
    } else {
      d = toDate(item.observedAt || item.timestamp);
    }

    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { dateKey, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] });
    }
    dayMap.get(dateKey).items.push(item);
  }

  // Sort days newest-first
  const days = Array.from(dayMap.values());
  days.sort((a, b) => b.date - a.date);

  // Generate human-readable labels
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const day of days) {
    if (day.date.getTime() === today.getTime()) {
      day.label = 'Today';
    } else if (day.date.getTime() === yesterday.getTime()) {
      day.label = 'Yesterday';
    } else {
      day.label = day.date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  return days;
}

/**
 * Get chip config (label, tone, iconName) for a note type.
 *
 * @param {string} type - 'text' | 'voice' | 'lesson' | 'media' | 'report'
 * @returns {{ label: string, tone: string, iconName: string }}
 */
export function getTypeChipConfig(type) {
  switch (type) {
    case 'text':
      return { label: 'Observation', tone: 'slate', iconName: 'Eye' };
    case 'voice':
      return { label: 'Voice', tone: 'violet', iconName: 'Mic' };
    case 'lesson':
      return { label: 'Lesson', tone: 'green', iconName: 'BookOpen' };
    case 'media':
      return { label: 'Media', tone: 'indigo', iconName: 'Image' };
    case 'report':
      return { label: 'Report', tone: 'amber', iconName: 'FileText' };
    default:
      return { label: 'Observation', tone: 'slate', iconName: 'Eye' };
  }
}

/**
 * Look up the teacher object for a note from the classroomTeachers array.
 * Falls back to a minimal object built from the note's cached fields.
 *
 * @param {{ createdBy: string, createdByName?: string }} note
 * @param {Array<{ id: string, displayName: string, role?: string, photoURL?: string }>} teachers
 * @returns {{ id: string, displayName: string, role: string, photoURL?: string }}
 */
export function getTeacherForNote(note, teachers) {
  const match = teachers.find((t) => t.id === note.createdBy);
  if (match) return match;

  return {
    id: note.createdBy,
    displayName: note.createdByName || 'Unknown Teacher',
    role: 'teacher',
  };
}

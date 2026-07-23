/**
 * Pure helper functions for useTimelineData hook (#128).
 * Separated from the hook so they can be imported and tested without Firebase.
 */

import { toDate } from '../components/classroomTimelineUtils.js';

/**
 * Merge multiple note arrays, deduplicate by id, sort newest-first.
 */
export function mergeAndDedupe(observations, media, reports) {
  const all = [...observations, ...media, ...reports];
  const seen = new Set();
  const deduped = [];
  for (const item of all) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  deduped.sort((a, b) => {
    const dateA = toDate(a.observedAt) || new Date(0);
    const dateB = toDate(b.observedAt) || new Date(0);
    return dateB - dateA;
  });
  return deduped;
}

// computePerStudentCounts removed in #221 Sprint 2 — stats now from statsCache.

/**
 * Check if the current user has access to a classroom.
 * Only classroomadmins are scoped — superadmins and teachers pass freely.
 */
export function checkClassroomAccess(userRole, manageableClassrooms, classroomId) {
  if (userRole === 'classroomadmin') {
    const scoped = Array.isArray(manageableClassrooms) ? manageableClassrooms : [];
    return scoped.includes(classroomId);
  }
  return true;
}

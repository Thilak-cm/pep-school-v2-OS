/**
 * Pure helper functions for useTimelineData hook (#128).
 * Separated from the hook so they can be imported and tested without Firebase.
 */

// mergeAndDedupe removed in #221 — single observations collection, no merge needed.
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

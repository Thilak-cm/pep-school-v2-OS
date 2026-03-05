/**
 * Scoping utilities for classroom admin access control.
 *
 * These pure functions determine which teachers a classroom admin
 * can see and act on, based on their manageableClassrooms.
 */

/**
 * Filter teachers to only those assigned to at least one of the
 * admin's manageable classrooms.
 *
 * @param {Array<{id: string}>} teachers - Full teacher list
 * @param {Array<{id: string, teacherIds: string[]}>} classrooms - Scoped classrooms
 * @param {string[]} manageableClassrooms - Classroom IDs the admin manages
 * @returns {Array} Filtered teachers
 */
export const filterTeachersForAdmin = (teachers, classrooms, manageableClassrooms) => {
  if (!teachers.length || !classrooms.length || !manageableClassrooms.length) return [];

  const managedSet = new Set(manageableClassrooms);
  const inScopeTeacherIds = new Set();

  for (const cls of classrooms) {
    if (managedSet.has(cls.id)) {
      for (const tid of (cls.teacherIds || [])) {
        inScopeTeacherIds.add(tid);
      }
    }
  }

  return teachers.filter(t => inScopeTeacherIds.has(t.id));
};

/**
 * Check whether a specific user is in scope for a classroom admin.
 *
 * @param {string} userId - The user ID to check
 * @param {Array<{id: string, teacherIds: string[]}>} classrooms - Scoped classrooms
 * @param {string[]} manageableClassrooms - Classroom IDs the admin manages
 * @returns {boolean}
 */
export const isUserInScope = (userId, classrooms, manageableClassrooms) => {
  if (!userId || !classrooms.length || !manageableClassrooms.length) return false;

  const managedSet = new Set(manageableClassrooms);

  for (const cls of classrooms) {
    if (managedSet.has(cls.id) && (cls.teacherIds || []).includes(userId)) {
      return true;
    }
  }

  return false;
};

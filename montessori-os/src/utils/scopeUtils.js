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
 * Extract unique teacher IDs from a list of classrooms.
 * Used to scope Firestore queries so classroom admins only fetch
 * teacher documents for users assigned to their classrooms.
 *
 * @param {Array<{id: string, teacherIds?: string[]}>} classrooms - Scoped classrooms
 * @returns {string[]} Unique teacher IDs
 */
export const extractTeacherIdsFromClassrooms = (classrooms) => {
  const ids = new Set();
  for (const cls of classrooms) {
    for (const tid of (cls.teacherIds || [])) {
      ids.add(tid);
    }
  }
  return [...ids];
};

/**
 * Filter students to only those in the admin's manageable classrooms.
 *
 * @param {Array<{id: string, classroomId?: string}>} students - Full student list
 * @param {string[]} manageableClassrooms - Classroom IDs the admin manages
 * @returns {Array} Filtered students
 */
export const filterStudentsForAdmin = (students, manageableClassrooms) => {
  if (!students.length || !manageableClassrooms.length) return [];

  const managedSet = new Set(manageableClassrooms);
  return students.filter(s => s.classroomId && managedSet.has(s.classroomId));
};

/**
 * Check whether a student is in scope for a classroom admin.
 *
 * @param {Object|null} student - Student object with classroomId
 * @param {string[]} manageableClassrooms - Classroom IDs the admin manages
 * @returns {boolean}
 */
export const isStudentInScope = (student, manageableClassrooms) => {
  if (!student || !student.classroomId || !manageableClassrooms.length) return false;
  return manageableClassrooms.includes(student.classroomId);
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

/**
 * PEP-223: Pure logic for StudentPicker scope resolution.
 */

/**
 * Determine initial behavior from scope prop.
 * - hardcoded: use provided defaults, no fetch
 * - program: fetch all students in the program on mount
 * - school-wide: fetch all students on mount
 */
export function resolveInitialState({ scope, defaults }) {
  switch (scope) {
    case "hardcoded":
      return { students: defaults || [], shouldFetch: false };
    case "school-wide":
      return { students: [], shouldFetch: true };
    case "program":
    default:
      return { students: [], shouldFetch: true };
  }
}

/**
 * PEP-222: Determine which classrooms a user can access based on their role.
 *
 * @param {object} params
 * @param {Array<{id: string, teacherIds?: string[]}>} params.classroomDocs - Classroom docs with teacherIds
 * @param {string} params.role - User role
 * @param {string} params.uid - User UID
 * @param {string[]} params.manageableClassrooms - Classroomadmin's manageable classroom IDs
 * @returns {Set<string>|null} Set of accessible classroom IDs, or null for unrestricted access
 */
export function filterAccessibleClassrooms({ classroomDocs, role, uid, manageableClassrooms }) {
  if (role === "superadmin") return null;
  if (role === "classroomadmin") return new Set(manageableClassrooms || []);
  if (role === "teacher") {
    return new Set(
      classroomDocs
        .filter((c) => (c.teacherIds || []).includes(uid))
        .map((c) => c.id)
    );
  }
  return new Set();
}

import { isClassroomAdmin, isSuperAdmin } from '../../utils/roleUtils.js';

/**
 * Mirrors the chat-management branches in firestore.rules using the user and
 * student scope already loaded by App. Firestore remains authoritative; this
 * predicate only prevents readers from being offered controls they cannot use.
 */
export function canManageChildChat({
  chat,
  currentUser,
  userRole,
  manageableClassrooms = [],
  studentClassroomId,
}) {
  if (!chat || !currentUser?.uid) return false;
  if (chat.createdBy === currentUser.uid) return true;
  if (isSuperAdmin(userRole)) return true;
  if (!isClassroomAdmin(userRole)) return false;

  const classroomId = studentClassroomId || chat.classroomId;
  return Boolean(classroomId && manageableClassrooms.includes(classroomId));
}

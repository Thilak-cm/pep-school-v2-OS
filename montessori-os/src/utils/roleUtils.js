export const isSuperAdmin = (role) => role === 'superadmin';

export const isClassroomAdmin = (role) => role === 'classroomadmin';

export const isAdminRole = (role) => isSuperAdmin(role) || isClassroomAdmin(role);

export const getRoleLabel = (role) => {
  if (isSuperAdmin(role)) return 'Super Admin';
  if (isClassroomAdmin(role)) return 'Classroom Admin';
  if (role === 'teacher') return 'Teacher';
  return role || 'User';
};

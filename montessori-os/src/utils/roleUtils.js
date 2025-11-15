export const isSuperAdmin = (role) => role === 'superadmin';

export const isProgramAdmin = (role) => role === 'admin';

export const isAdminRole = (role) => isSuperAdmin(role) || isProgramAdmin(role);

export const getRoleLabel = (role) => {
  if (isSuperAdmin(role)) return 'Super Admin';
  if (isProgramAdmin(role)) return 'Program Admin';
  if (role === 'teacher') return 'Teacher';
  return role || 'User';
};

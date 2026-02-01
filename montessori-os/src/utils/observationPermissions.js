import { isAdminRole } from './roleUtils';

/**
 * Check if user can delete an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can delete the observation
 */
export const canDeleteObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  if (isAdminRole(userRole)) return true;
  const isAuthor = observation.createdBy === currentUser.uid || observation.teacherId === currentUser.uid;
  if (!isAuthor) return false;
  if (observation.type === 'media') {
    const ts = observation.createdAt || observation.observedAt || observation.timestamp;
    const createdAt = ts?.toDate
      ? ts.toDate()
      : (ts?.seconds ? new Date(ts.seconds * 1000) : (ts ? new Date(ts) : null));
    if (!createdAt) return false;
    return (Date.now() - createdAt.getTime()) <= 24 * 60 * 60 * 1000;
  }
  return true;
};

/**
 * Check if user can edit an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can edit the observation
 */
export const canEditObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  return isAdminRole(userRole);
};

/**
 * Check if user can reassign an observation to another student
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can reassign the observation
 */
export const canReassignObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  // Only the creator can reassign notes (both teachers and admins)
  return observation.createdBy === currentUser.uid || observation.teacherId === currentUser.uid;
};

/**
 * Check if user can view an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can view the observation
 */
export const canViewObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  
  // Admin can view all observations
  if (isAdminRole(userRole)) return true;
  
  // Teachers can view observations they created
  if (observation.createdBy === currentUser.uid || observation.teacherId === currentUser.uid) return true;
  
  // Teachers can view public observations (not private)
  if (!observation.isPrivate) return true;
  
  return false;
};

/**
 * Check if user can star/unstar an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can star the observation
 */
export const canStarObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  
  // Admin can star any observation
  if (isAdminRole(userRole)) return true;
  
  // Teachers can star observations they created
  return observation.createdBy === currentUser.uid || observation.teacherId === currentUser.uid;
};

/**
 * Check if user can create observations for a specific student
 * @param {Object} student - Student object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @param {Array} userClassrooms - Array of classroom IDs the user has access to
 * @returns {boolean} Whether user can create observations for the student
 */
export const canCreateObservationForStudent = (student, currentUser, userRole, userClassrooms = []) => {
  if (!currentUser || !student) return false;
  
  // Admin can create observations for any student
  if (isAdminRole(userRole)) return true;
  
  // Teachers can create observations for students in their assigned classrooms
  if (userRole === 'teacher') {
    const studentClassroomId = typeof student.classroomId === 'object' 
      ? student.classroomId.id 
      : student.classroomId;
    
    return userClassrooms.includes(studentClassroomId);
  }
  
  return false;
};

/**
 * Get all available actions for a user on an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {Object} Object with boolean flags for each action
 */
export const getObservationPermissions = (observation, currentUser, userRole) => {
  return {
    canView: canViewObservation(observation, currentUser, userRole),
    canEdit: canEditObservation(observation, currentUser, userRole),
    canDelete: canDeleteObservation(observation, currentUser, userRole),
    canReassign: canReassignObservation(observation, currentUser, userRole),
    canStar: canStarObservation(observation, currentUser, userRole)
  };
}; 

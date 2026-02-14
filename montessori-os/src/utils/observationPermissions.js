import { isAdminRole } from './roleUtils';

export const AUTHOR_ACTION_WINDOW_HOURS = 48;
export const AUTHOR_ACTION_EXPIRED_MESSAGE = 'Editing permissions expired. Ask admins.';

const toObservationDate = (observation) => {
  const ts = observation?.createdAt || observation?.observedAt || observation?.timestamp;
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isObservationAuthor = (observation, currentUser) => {
  if (!currentUser || !observation) return false;
  return observation.createdBy === currentUser.uid || observation.teacherId === currentUser.uid;
};

export const isWithinAuthorActionWindow = (
  observation,
  timeLimitHours = AUTHOR_ACTION_WINDOW_HOURS
) => {
  const createdAt = toObservationDate(observation);
  if (!createdAt) return false;
  return (Date.now() - createdAt.getTime()) <= timeLimitHours * 60 * 60 * 1000;
};

export const isAuthorActionExpired = (observation, currentUser, userRole) => {
  if (!observation || !currentUser || isAdminRole(userRole)) return false;
  return isObservationAuthor(observation, currentUser) && !isWithinAuthorActionWindow(observation);
};

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
  return isObservationAuthor(observation, currentUser) && isWithinAuthorActionWindow(observation);
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
  if (isAdminRole(userRole)) return true;
  return isObservationAuthor(observation, currentUser) && isWithinAuthorActionWindow(observation);
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
  if (isAdminRole(userRole)) return true;
  return isObservationAuthor(observation, currentUser) && isWithinAuthorActionWindow(observation);
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
  if (isObservationAuthor(observation, currentUser)) return true;
  
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
  return isObservationAuthor(observation, currentUser);
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

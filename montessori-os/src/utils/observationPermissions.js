/**
 * Check if user can delete an observation
 * @param {Object} observation - Observation object
 * @param {Object} currentUser - Current user object
 * @param {string} userRole - User role ('admin', 'teacher', etc.)
 * @returns {boolean} Whether user can delete the observation
 */
export const canDeleteObservation = (observation, currentUser, userRole) => {
  if (!currentUser || !observation) return false;
  // Only admin can delete notes
  return userRole === 'admin';
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
  // Only admin can edit notes
  return userRole === 'admin';
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
  return observation.teacherId === currentUser.uid;
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
  if (userRole === 'admin') return true;
  
  // Teachers can view observations they created
  if (observation.teacherId === currentUser.uid) return true;
  
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
  if (userRole === 'admin') return true;
  
  // Teachers can star observations they created
  return observation.teacherId === currentUser.uid;
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
  if (userRole === 'admin') return true;
  
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
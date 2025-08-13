/**
 * Export Student Timeline Utility
 * Exports all observations for a student as a comprehensive JSON file
 */

/**
 * Generate export metadata
 * @param {Object} currentUser - Current user object
 * @returns {Object} Export metadata
 */
const generateExportMetadata = (currentUser) => {
  return {
    exportedAt: new Date().toISOString(),
    exportedBy: currentUser?.email || currentUser?.displayName || 'Unknown User',
    exportType: 'student_timeline_export',
    version: '1.0'
  };
};

/**
 * Generate student information object
 * @param {Object} student - Student object
 * @returns {Object} Student information
 */
const generateStudentInfo = (student) => {
  return {
    id: student?.id || '',
    name: student?.name || '',
    displayName: student?.displayName || '',
    firstName: student?.firstName || '',
    lastName: student?.lastName || ''
  };
};

/**
 * Generate summary statistics
 * @param {Array} observations - Array of observations
 * @returns {Object} Summary statistics
 */
const generateSummary = (observations) => {
  if (!observations || observations.length === 0) {
    return {
      totalObservations: 0,
      voiceNotes: 0,
      textNotes: 0,
      starredNotes: 0,
      privateNotes: 0,
      dateRange: {
        earliest: null,
        latest: null
      }
    };
  }

  // Count by type and status
  const voiceNotes = observations.filter(obs => obs.type === 'voice').length;
  const textNotes = observations.filter(obs => obs.type === 'text').length;
  const starredNotes = observations.filter(obs => obs.isStarred).length;
  const privateNotes = observations.filter(obs => obs.isPrivate).length;

  // Get date range
  const timestamps = observations
    .map(obs => obs.observedAt || obs.timestamp)
    .filter(Boolean)
    .map(timestamp => {
      if (timestamp?.seconds) {
        return new Date(timestamp.seconds * 1000);
      }
      if (timestamp?.toDate) {
        return timestamp.toDate();
      }
      if (timestamp instanceof Date) {
        return timestamp;
      }
      return null;
    })
    .filter(Boolean);

  let earliest = null;
  let latest = null;

  if (timestamps.length > 0) {
    earliest = new Date(Math.min(...timestamps)).toISOString();
    latest = new Date(Math.max(...timestamps)).toISOString();
  }

  return {
    totalObservations: observations.length,
    voiceNotes,
    textNotes,
    starredNotes,
    privateNotes,
    dateRange: {
      earliest,
      latest
    }
  };
};

/**
 * Clean observation data for export
 * @param {Object} observation - Raw observation object
 * @returns {Object} Cleaned observation object
 */
const cleanObservationData = (observation) => {
  return {
    id: observation.id || '',
    text: observation.text || '',
    type: observation.type || '',
    duration: observation.duration || null,
    observedAt: observation.observedAt || null,
    timestamp: observation.timestamp || null,
    createdBy: observation.createdBy || '',
    createdByName: observation.createdByName || '',
    createdByEmail: observation.createdByEmail || '',
    teacherId: observation.teacherId || '',
    teacherName: observation.teacherName || '',
    teacherEmail: observation.teacherEmail || '',
    studentId: observation.studentId || '',
    isStarred: observation.isStarred || false,
    isPrivate: observation.isPrivate || false,
    isDraft: observation.isDraft || false,
    editCount: observation.editCount || 0
  };
};

/**
 * Generate filename for export
 * @param {Object} student - Student object
 * @param {Array} observations - Array of observations
 * @returns {string} Filename
 */
const generateFilename = (student, observations) => {
  const studentName = student?.name || student?.displayName || 
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 
    'Unknown_Student';
  
  const cleanName = studentName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().split('T')[0];
  const count = observations?.length || 0;
  
  return `${cleanName}_Timeline_${count}_Notes_${date}.json`;
};

/**
 * Download JSON file
 * @param {Object} data - Data to export
 * @param {string} filename - Filename for download
 */
const downloadJSON = (data, filename) => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

/**
 * Export student timeline data
 * @param {Object} student - Student object
 * @param {Array} observations - Array of observations
 * @param {Object} currentUser - Current user object
 * @param {boolean} respectFilters - Whether to respect current filters (default: false)
 * @param {Array} filteredObservations - Filtered observations if respectFilters is true
 */
export const exportStudentTimeline = (
  student, 
  observations, 
  currentUser, 
  respectFilters = false,
  filteredObservations = null
) => {
  try {
    // Use filtered observations if requested, otherwise use all observations
    const observationsToExport = respectFilters && filteredObservations ? filteredObservations : observations;
    
    if (!observationsToExport || observationsToExport.length === 0) {
      throw new Error('No observations to export');
    }

    // Generate export data
    const exportData = {
      exportMetadata: generateExportMetadata(currentUser),
      student: generateStudentInfo(student),
      observations: observationsToExport.map(cleanObservationData),
      summary: generateSummary(observationsToExport)
    };

    // Generate filename
    const filename = generateFilename(student, observationsToExport);

    // Download file
    downloadJSON(exportData, filename);

    return {
      success: true,
      filename,
      observationCount: observationsToExport.length
    };

  } catch (error) {
    console.error('Error exporting student timeline:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Export filtered observations only
 * @param {Object} student - Student object
 * @param {Array} filteredObservations - Filtered observations
 * @param {Object} currentUser - Current user object
 * @returns {Object} Export result
 */
export const exportFilteredTimeline = (student, filteredObservations, currentUser) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, true, filteredObservations);
};

export default exportStudentTimeline;

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
 * Format timestamp for text export
 * @param {Object} timestamp - Firebase timestamp object
 * @returns {string} Formatted timestamp string
 */
const formatTimestampForText = (timestamp) => {
  if (!timestamp) return 'No timestamp';
  
  let date;
  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'Invalid timestamp';
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Generate text content for export (clean, observation-focused format)
 * @param {Object} exportData - Export data object
 * @returns {string} Formatted text content
 */
const generateTextContent = (exportData) => {
  const { student, observations } = exportData;
  
  let text = '';
  
  // Simple header with student name
  text += `${student?.displayName || student?.name || 'Student'} - Observation Timeline\n`;
  text += '='.repeat(50) + '\n\n';
  
  // Observations in clean format
  observations.forEach((obs, index) => {
    // Format date nicely
    const date = formatTimestampForText(obs.observedAt || obs.timestamp);
    
    // Add observation number and date
    text += `${index + 1}. ${date}\n`;
    
    // Add the actual observation text
    if (obs.text) {
      text += `${obs.text}\n`;
    }
    
    // Add author information
    const author = obs.createdByName || obs.createdByEmail || obs.createdBy || 'Unknown Teacher';
    text += `Author: ${author}\n`;
    
    // Add type indicator if it's a voice note
    if (obs.type === 'voice' && obs.duration) {
      text += `[Voice note - ${obs.duration}s]\n`;
    }
    
    // Add spacing between observations
    text += '\n';
  });
  
  // Simple footer
  text += `Total observations: ${observations.length}`;
  
  return text;
};

/**
 * Generate filename for export
 * @param {Object} student - Student object
 * @param {Array} observations - Array of observations
 * @param {string} format - Export format ('json' or 'txt')
 * @returns {string} Filename
 */
const generateFilename = (student, observations, format = 'json') => {
  const studentName = student?.name || student?.displayName || 
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 
    'Unknown_Student';
  
  const cleanName = studentName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().split('T')[0];
  const count = observations?.length || 0;
  
  const extension = format === 'txt' ? 'txt' : 'json';
  return `${cleanName}_Timeline_${count}_Notes_${date}.${extension}`;
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
 * Download text file
 * @param {string} textContent - Text content to export
 * @param {string} filename - Filename for download
 */
const downloadText = (textContent, filename) => {
  const blob = new Blob([textContent], { type: 'text/plain' });
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
 * @param {string} format - Export format ('json' or 'txt')
 * @param {boolean} respectFilters - Whether to respect current filters (default: false)
 * @param {Array} filteredObservations - Filtered observations if respectFilters is true
 */
export const exportStudentTimeline = (
  student, 
  observations, 
  currentUser, 
  format = 'json',
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
    const filename = generateFilename(student, observationsToExport, format);

    // Download file based on format
    if (format === 'txt') {
      const textContent = generateTextContent(exportData);
      downloadText(textContent, filename);
    } else {
      downloadJSON(exportData, filename);
    }

    return {
      success: true,
      filename,
      observationCount: observationsToExport.length,
      format
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
 * @param {string} format - Export format ('json' or 'txt')
 * @returns {Object} Export result
 */
export const exportFilteredTimeline = (student, filteredObservations, currentUser, format = 'json') => {
  return exportStudentTimeline(student, filteredObservations, currentUser, format, true, filteredObservations);
};

/**
 * Export student timeline as text (for teachers)
 * @param {Object} student - Student object
 * @param {Array} observations - Array of observations
 * @param {Object} currentUser - Current user object
 * @param {boolean} respectFilters - Whether to respect current filters (default: false)
 * @param {Array} filteredObservations - Filtered observations if respectFilters is true
 * @returns {Object} Export result
 */
export const exportStudentTimelineAsText = (
  student, 
  observations, 
  currentUser, 
  respectFilters = false,
  filteredObservations = null
) => {
  return exportStudentTimeline(student, observations, currentUser, 'txt', respectFilters, filteredObservations);
};

/**
 * Export filtered observations as text (for teachers)
 * @param {Object} student - Student object
 * @param {Array} filteredObservations - Filtered observations
 * @param {Object} currentUser - Current user object
 * @returns {Object} Export result
 */
export const exportFilteredTimelineAsText = (student, filteredObservations, currentUser) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, 'txt', true, filteredObservations);
};

export default exportStudentTimeline;

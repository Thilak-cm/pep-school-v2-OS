/**
 * Export Student Timeline Utility
 * Student-focused wrapper around the generic observations export helpers.
 */
import {
  generateFilename,
  generateTextContent,
  downloadJSON,
  downloadText,
  cleanObservationData,
  generateExportMetadata,
  generateSummary
} from './export_observations';

/**
 * Generate student information object for export payloads.
 * @param {Object} student - Student object
 * @returns {Object}
 */
const generateStudentInfo = (student) => ({
  id: student?.id || '',
  name: student?.name || '',
  displayName: student?.displayName || '',
  firstName: student?.firstName || '',
  lastName: student?.lastName || ''
});

/**
 * Derive a filename specific to student timeline exports.
 * @param {Object} student
 * @param {Array} observations
 * @param {string} format
 * @returns {string}
 */
const buildStudentTimelineFilename = (student, observations, format = 'json') => {
  const studentName = student?.name || student?.displayName ||
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') ||
    'Unknown_Student';

  return generateFilename({
    subjectName: studentName,
    observationCount: observations?.length || 0,
    format,
    segments: ['Timeline']
  });
};

/**
 * Build text export content with the legacy student-specific header.
 * @param {Object} student
 * @param {Array} observations
 * @returns {string}
 */
const buildStudentTextContent = (student, observations) => {
  const header = `${student?.displayName || student?.name || 'Student'} - Observation Timeline`;
  const cleanedObservations = observations.map(cleanObservationData);
  return generateTextContent({ subjectTitle: header, observations: cleanedObservations });
};

/**
 * Export student timeline data.
 * @param {Object} student - Student object
 * @param {Array} observations - Observation records
 * @param {Object} currentUser - Current user triggering export
 * @param {string} format - 'json' or 'txt'
 * @param {boolean} respectFilters - Whether to use filtered observations
 * @param {Array|null} filteredObservations - Filtered observations when respectFilters is true
 * @returns {Object}
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
    const observationsToExport = respectFilters && filteredObservations
      ? filteredObservations
      : observations;

    if (!observationsToExport || observationsToExport.length === 0) {
      throw new Error('No observations to export');
    }

    const subject = {
      ...generateStudentInfo(student),
      type: 'student'
    };

    if (format === 'txt') {
      const filename = buildStudentTimelineFilename(student, observationsToExport, 'txt');
      const textContent = buildStudentTextContent(student, observationsToExport);
      downloadText(textContent, filename);
      return {
        success: true,
        filename,
        observationCount: observationsToExport.length,
        format: 'txt'
      };
    }

    const cleaned = observationsToExport.map(cleanObservationData);
    const exportData = {
      exportMetadata: generateExportMetadata(currentUser, 'student_timeline_export'),
      student: subject,
      observations: cleaned,
      summary: generateSummary(cleaned)
    };

    const filename = buildStudentTimelineFilename(student, cleaned, format);
    downloadJSON(exportData, filename);

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
 * Export filtered observations only.
 */
export const exportFilteredTimeline = (student, filteredObservations, currentUser, format = 'json') => {
  return exportStudentTimeline(student, filteredObservations, currentUser, format, true, filteredObservations);
};

/**
 * Export student timeline as text (for teachers).
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
 * Export filtered observations as text (for teachers).
 */
export const exportFilteredTimelineAsText = (student, filteredObservations, currentUser) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, 'txt', true, filteredObservations);
};

export default exportStudentTimeline;

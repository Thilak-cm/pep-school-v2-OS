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
 * @param {string} noteType - 'lesson' | 'textVoice' | null
 * @returns {string}
 */
const buildStudentTimelineFilename = (student, observations, format = 'json', noteType = null) => {
  const studentName = student?.name || student?.displayName ||
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') ||
    'Unknown_Student';

  const segment = noteType === 'lesson' ? 'Lesson_Notes' : noteType === 'textVoice' ? 'Observations' : 'Timeline';

  return generateFilename({
    subjectName: studentName,
    observationCount: observations?.length || 0,
    format,
    segments: [segment]
  });
};

/**
 * Build text export content with the legacy student-specific header.
 * @param {Object} student
 * @param {Array} observations
 * @param {string} noteType - 'lesson' | 'textVoice' | null
 * @returns {string}
 */
const buildStudentTextContent = (student, observations, noteType = null) => {
  const studentName = student?.displayName || student?.name || 'Student';
  const typeLabel = noteType === 'lesson' ? 'Lesson Notes' : noteType === 'textVoice' ? 'Observations' : 'Observation Timeline';
  const header = `${studentName} - ${typeLabel}`;
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
 * @param {string} noteType - 'lesson' | 'textVoice' | null
 * @returns {Object}
 */
export const exportStudentTimeline = (
  student,
  observations,
  currentUser,
  format = 'json',
  respectFilters = false,
  filteredObservations = null,
  noteType = null
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
      const filename = buildStudentTimelineFilename(student, observationsToExport, 'txt', noteType);
      const textContent = buildStudentTextContent(student, observationsToExport, noteType);
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

    const filename = buildStudentTimelineFilename(student, cleaned, format, noteType);
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
export const exportFilteredTimeline = (student, filteredObservations, currentUser, format = 'json', noteType = null) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, format, true, filteredObservations, noteType);
};

/**
 * Export student timeline as text (for teachers).
 */
export const exportStudentTimelineAsText = (
  student,
  observations,
  currentUser,
  respectFilters = false,
  filteredObservations = null,
  noteType = null
) => {
  return exportStudentTimeline(student, observations, currentUser, 'txt', respectFilters, filteredObservations, noteType);
};

/**
 * Export filtered observations as text (for teachers).
 */
export const exportFilteredTimelineAsText = (student, filteredObservations, currentUser, noteType = null) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, 'txt', true, filteredObservations, noteType);
};

export default exportStudentTimeline;

/**
 * Generic Observations Export Utilities
 * Shared helpers for exporting observation data in JSON or text formats.
 */

/**
 * Build metadata describing this export event.
 * @param {Object} currentUser - The user triggering the export.
 * @param {string} exportType - Identifier describing the export target.
 * @param {string} version - Schema/version label for downstream processing.
 * @returns {Object}
 */
export const generateExportMetadata = (currentUser, exportType = 'observations_export', version = '1.0') => ({
  exportedAt: new Date().toISOString(),
  exportedBy: currentUser?.email || currentUser?.displayName || 'Unknown User',
  exportType,
  version
});

/**
 * Produce basic summary stats for a collection of observations.
 * @param {Array} observations - Observation records.
 * @returns {Object}
 */
export const generateSummary = (observations) => {
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

  const voiceNotes = observations.filter(obs => obs.type === 'voice').length;
  const textNotes = observations.filter(obs => obs.type === 'text').length;
  const starredNotes = observations.filter(obs => obs.isStarred).length;
  const privateNotes = observations.filter(obs => obs.isPrivate).length;

  const timestamps = observations
    .map(obs => obs.observedAt || obs.timestamp)
    .filter(Boolean)
    .map((timestamp) => {
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
 * Normalize observation document fields for export payloads.
 * @param {Object} observation
 * @returns {Object}
 */
export const cleanObservationData = (observation = {}) => ({
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
  classroomId: observation.classroomId || '',
  isStarred: observation.isStarred || false,
  isPrivate: observation.isPrivate || false,
  isDraft: observation.isDraft || false,
  editCount: observation.editCount || 0
});

/**
 * Convert a Firestore timestamp or JS Date-ish object into a readable label.
 * @param {Object|Date} timestamp
 * @returns {string}
 */
export const formatTimestampForText = (timestamp) => {
  if (!timestamp) return 'No timestamp';

  let date;
  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp.toDate === 'function') {
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
 * Render observation data as plain text for quick review.
 * @param {Object} params
 * @param {string} params.subjectTitle - Header shown at the top of the text export.
 * @param {Array} params.observations - Cleaned observations array.
 * @param {boolean} params.includeSummary - Append total observation count at the end.
 * @param {Array|null} params.groups - Optional grouped observations to render with dividers.
 * @returns {string}
 */
export const generateTextContent = ({ subjectTitle, observations = [], includeSummary = true, groups = null }) => {
  const title = subjectTitle || 'Observations Export';
  let text = '';

  const appendObservationLines = (list) => {
    if (!list || !list.length) return '';
    return list
      .map((obs, index) => {
        const date = formatTimestampForText(obs.observedAt || obs.timestamp);
        const lines = [];
        lines.push(`${index + 1}. ${date}`);
        if (obs.text) {
          lines.push(obs.text);
        }
        const author = obs.createdByName || obs.createdByEmail || obs.createdBy || 'Unknown Teacher';
        lines.push(`Author: ${author}`);
        if (obs.type === 'voice' && obs.duration) {
          lines.push(`[Voice note - ${obs.duration}s]`);
        }
        return lines.join('\n');
      })
      .join('\n\n') + '\n';
  };

  const totalCount = Array.isArray(groups) && groups.length
    ? groups.reduce((sum, group) => sum + (group?.observations?.length || 0), 0)
    : observations.length;

  text += `${title}\n`;
  text += '='.repeat(Math.max(10, title.length)) + '\n\n';

  if (Array.isArray(groups) && groups.length) {
    groups.forEach((group, idx) => {
      const groupLabel = group?.label || group?.name || group?.id || `Group ${idx + 1}`;
      text += `Classroom: ${groupLabel}\n`;
      text += '-'.repeat(Math.max(12, groupLabel.length + 11)) + '\n\n';

      const groupObservations = group?.observations || [];
      if (groupObservations.length === 0) {
        text += 'No notes found for this classroom.\n\n';
      } else {
        text += appendObservationLines(groupObservations);
      }

      if (idx < groups.length - 1) {
        text += `${'-'.repeat(48)}\n\n`;
      }
    });
  } else {
    text += appendObservationLines(observations);
  }

  if (includeSummary) {
    if (!text.endsWith('\n')) {
      text += '\n';
    }
    text += `Total observations: ${totalCount}`;
  }

  return text;
};

/**
 * Create safe-by-default filenames for exported data.
 * @param {Object} params
 * @param {string} params.subjectName - Base label for the file.
 * @param {number} params.observationCount - Count appended for quick scanning.
 * @param {string} params.format - File extension hint.
 * @param {string[]} params.segments - Additional segments inserted between name and date.
 * @returns {string}
 */
export const generateFilename = ({
  subjectName = 'Observations',
  observationCount = 0,
  format = 'json',
  segments = []
} = {}) => {
  const extension = format === 'txt' ? 'txt' : 'json';
  const cleanSubject = String(subjectName || 'Observations')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'Observations';

  const cleanSegments = segments
    .map(segment => String(segment || '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim())
    .filter(Boolean);

  const date = new Date().toISOString().split('T')[0];
  const parts = [cleanSubject, ...cleanSegments, `${observationCount}_Notes_${date}`];

  return `${parts.join('_')}.${extension}`;
};

/**
 * Trigger a client-side JSON download.
 * @param {Object} data - Serializable export payload.
 * @param {string} filename - Target filename.
 */
export const downloadJSON = (data, filename) => {
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
 * Trigger a client-side text download.
 * @param {string} textContent - Plain text payload.
 * @param {string} filename - Target filename.
 */
export const downloadText = (textContent, filename) => {
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
 * High-level convenience helper to export observations.
 * @param {Object} params
 * @param {Array} params.observations - Raw observations to export.
 * @param {Object} params.currentUser - User triggering the export.
 * @param {string} params.format - 'json' or 'txt'.
 * @param {string} params.exportType - Metadata identifier.
 * @param {Object} params.subject - Context describing the export target (student, classroom, etc.).
 * @param {Function} params.filenameBuilder - Optional custom filename generator.
 * @param {string} params.textHeader - Optional override for the text export header.
 * @param {Array} params.groupedObservations - Optional grouped observations for structured exports.
 * @returns {Object} - Result summary.
 */
export const exportObservations = ({
  observations = [],
  currentUser,
  format = 'json',
  exportType = 'observations_export',
  subject = {},
  filenameBuilder,
  textHeader,
  groupedObservations = null
} = {}) => {
  const observationsToExport = Array.isArray(observations) ? observations : [];

  if (!observationsToExport.length) {
    throw new Error('No observations to export');
  }

  const cleanedObservations = observationsToExport.map(cleanObservationData);
  const cleanedGroups = Array.isArray(groupedObservations)
    ? groupedObservations.map((group, idx) => ({
        id: group?.id || null,
        label: group?.label || group?.name || group?.id || '',
        order: Number.isFinite(group?.order) ? group.order : idx,
        observations: (group?.observations || []).map(cleanObservationData)
      }))
    : null;

  const exportData = {
    exportMetadata: generateExportMetadata(currentUser, exportType),
    subject,
    observations: cleanedObservations,
    summary: generateSummary(cleanedObservations)
  };

  if (cleanedGroups && cleanedGroups.length) {
    const classroomsObject = {};
    cleanedGroups.forEach((group, index) => {
      const keySource = group.id || group.label || `group_${index + 1}`;
      const safeKey = String(keySource)
        .trim()
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .replace(/\s+/g, '_') || `group_${index + 1}`;

      classroomsObject[safeKey] = {
        id: group.id || null,
        name: group.label || keySource,
        order: group.order,
        count: group.observations.length,
        summary: generateSummary(group.observations),
        observations: group.observations
      };
    });

    exportData.classrooms = classroomsObject;
    exportData.groupedBy = 'classroom';
  }

  const subjectName = subject?.displayName || subject?.name || subject?.title || subject?.id || 'Observations';
  const filename = filenameBuilder
    ? filenameBuilder({ subject, observations: cleanedObservations, format })
    : generateFilename({ subjectName, observationCount: cleanedObservations.length, format });

  if (format === 'txt') {
    const header = textHeader || `${subjectName} Observations`;
    const textContent = generateTextContent({
      subjectTitle: header,
      observations: cleanedObservations,
      groups: cleanedGroups
    });
    downloadText(textContent, filename);
  } else {
    downloadJSON(exportData, filename);
  }

  return {
    success: true,
    filename,
    observationCount: cleanedObservations.length,
    format
  };
};

export default exportObservations;

import { LESSON_RATING_LABELS, LESSON_ATTENDANCE_LABELS, getLessonDimensions } from './lessonNoteConstraints.js';

/**
 * Unified Export Utilities
 * Consolidates generic observation exports and student timeline exports.
 */

// Shared constants for downstream consumers (UI + agents)
export const NOTE_KIND = {
  OBSERVATION: 'observation', // text + voice
  LESSON: 'lesson', // lesson notes
  BOTH: 'both'
};

// Core metadata + summary helpers
export const generateExportMetadata = (currentUser, exportType = 'observations_export', version = '1.0') => ({
  exportedAt: new Date().toISOString(),
  exportedBy: currentUser?.email || currentUser?.displayName || 'Unknown User',
  exportType,
  version
});

export const generateSummary = (observations) => {
  if (!observations || observations.length === 0) {
    return {
      totalObservations: 0,
      voiceNotes: 0,
      textNotes: 0,
      starredNotes: 0, // derived from starScore
      dateRange: {
        earliest: null,
        latest: null
      }
    };
  }

  const voiceNotes = observations.filter((obs) => obs.type === 'voice').length;
  const textNotes = observations.filter((obs) => obs.type === 'text').length;
  const starredNotes = observations.filter((obs) => Number.isFinite(obs.starScore)).length;

  const timestamps = observations
    .map((obs) => obs.observedAt || obs.timestamp)
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
    dateRange: {
      earliest,
      latest
    }
  };
};

// Observation normalizer used across exports
export const cleanObservationData = (observation = {}) => ({
  id: observation.id || '',
  text: observation.text || '',
  type: observation.type || '',
  durationSec: observation.durationSec || observation.duration || null,
  sttConfidence: observation.sttConfidence || null,
  observedAt: observation.observedAt || null,
  timestamp: observation.timestamp || null,
  createdAt: observation.createdAt || null,
  updatedAt: observation.updatedAt || null,
  createdBy: observation.createdBy || '',
  createdByName: observation.createdByName || '',
  createdByEmail: observation.createdByEmail || '',
  studentId: observation.studentId || '',
  classroomId: observation.classroomId || '',
  branchId: observation.branchId || '',
  groupId: observation.groupId || null,
  starScore: observation.starScore || null,
  lessonTitle: observation.lessonTitle || observation.title || '',
  lessonDescription: observation.lessonDescription || observation.description || '',
  programId: observation.programId || '',
  dimensionOrder: observation.dimensionOrder || null,
  ratings: observation.ratings || observation.dimensionRatings || {},
  groupDefaults: observation.groupDefaults || {},
  groupComment: observation.groupComment || '',
  studentComment: observation.studentComment || '',
  attendanceStatus: observation.attendanceStatus || '',
  coach: observation.coach || null
});

// Timestamp formatting for text exports
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

  const dateLabel = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const hours = date.getHours();
  const hour12 = ((hours + 11) % 12) + 1;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${dateLabel} | ${hour12}${ampm}`;
};

const normalizeToDate = (timestamp) => {
  if (!timestamp) return null;
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  return null;
};

const cleanNoteText = (text) => {
  if (text === null || text === undefined) return '';
  return String(text);
};

const parseDateInput = (value, endOfDay = false) => {
  if (!value) return null;
  if (value instanceof Date) {
    const date = new Date(value);
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  }
  if (typeof value === 'string') {
    const parts = value.split('-').map((p) => Number(p));
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      const [y, m, d] = parts;
      return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
      return parsed;
    }
  }
  return null;
};

const normalizeNoteKinds = (noteKinds = []) => {
  const kinds = Array.isArray(noteKinds) ? noteKinds : [noteKinds];
  const set = new Set();
  kinds.forEach((kind) => {
    const normalized = String(kind || '').toLowerCase();
    if (normalized === NOTE_KIND.LESSON) set.add(NOTE_KIND.LESSON);
    if (normalized === NOTE_KIND.OBSERVATION) set.add(NOTE_KIND.OBSERVATION);
    if (normalized === NOTE_KIND.BOTH) {
      set.add(NOTE_KIND.LESSON);
      set.add(NOTE_KIND.OBSERVATION);
    }
  });
  if (set.size === 0) {
    set.add(NOTE_KIND.LESSON);
    set.add(NOTE_KIND.OBSERVATION);
  }
  return set;
};

const matchesNoteKind = (obsType, allowedKinds) => {
  if (!allowedKinds || allowedKinds.size === 0) return true;
  if (allowedKinds.has(NOTE_KIND.LESSON) && obsType === 'lesson') return true;
  if (allowedKinds.has(NOTE_KIND.OBSERVATION) && obsType !== 'lesson') return true;
  return false;
};

export const filterObservationsForExport = ({
  observations = [],
  noteKinds = [NOTE_KIND.BOTH],
  dateRange = {}
} = {}) => {
  const allowedKinds = normalizeNoteKinds(noteKinds);
  const fromDate = parseDateInput(dateRange.from || dateRange.start || dateRange.startDate, false);
  const toDate = parseDateInput(dateRange.to || dateRange.end || dateRange.endDate, true);

  return (observations || []).filter((obs) => {
    if (!matchesNoteKind(obs?.type, allowedKinds)) return false;
    if (!fromDate && !toDate) return true;
    const ts = obs?.observedAt || obs?.timestamp;
    const asDate = normalizeToDate(ts);
    if (!asDate) return false;
    if (fromDate && asDate < fromDate) return false;
    if (toDate && asDate > toDate) return false;
    return true;
  });
};

const titleCase = (value = '') => {
  const str = String(value || '').replace(/[_-]/g, ' ').trim();
  if (!str) return '';
  return str.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const deriveBaseName = (title) => {
  if (!title) return 'Observations';
  const [firstPart] = String(title).split('-');
  const trimmed = firstPart?.trim();
  return trimmed || String(title).trim() || 'Observations';
};

const formatLessonRatings = (observation = {}) => {
  const dims = getLessonDimensions(observation);
  if (!dims || !dims.length) return null;
  return dims
    .filter((d) => d?.name)
    .map((d) => `${d.name}: ${LESSON_RATING_LABELS[d.value] || titleCase(d.value || 'N/A')}`)
    .join('; ');
};

const formatDateOnly = (date) => {
  if (!(date instanceof Date)) return 'Unknown date';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const buildTextHeader = ({ subjectTitle, observations = [], groups = null }) => {
  const allObservations = Array.isArray(groups) && groups.length
    ? groups.flatMap((group) => group?.observations || [])
    : observations;

  const allTimestamps = allObservations
    .map((obs) => normalizeToDate(obs?.observedAt || obs?.timestamp))
    .filter(Boolean);

  let startDateLabel = 'Unknown date';
  let endDateLabel = 'Unknown date';

  if (allTimestamps.length) {
    const earliest = new Date(Math.min(...allTimestamps.map((d) => d.getTime())));
    const latest = new Date(Math.max(...allTimestamps.map((d) => d.getTime())));
    startDateLabel = formatDateOnly(earliest);
    endDateLabel = formatDateOnly(latest);
  }

  const baseName = deriveBaseName(subjectTitle);
  const possessor = baseName.endsWith('s') ? `${baseName}'` : `${baseName}'s`;
  const title = `${possessor} notes from ${startDateLabel} to ${endDateLabel}`;
  const totalCount = allObservations.length;
  const underlineLength = Math.max(10, title.length, `Total observations: ${totalCount}`.length);

  return { title, totalCount, underlineLength };
};

// Text export renderer
export const generateTextContent = ({
  subjectTitle,
  observations = [],
  includeSummary = true,
  groups = null
} = {}) => {
  const { title, totalCount, underlineLength } = buildTextHeader({ subjectTitle, observations, groups });
  let text = '';

  const formatLessonObservation = (obs, index, date) => {
    const lines = [];
    lines.push(`${index + 1}. ${date}`);
    const author = obs.createdByName || obs.createdByEmail || obs.createdBy || 'Unknown Teacher';
    lines.push(`Author: ${author}`);
    lines.push(`Lesson: ${obs.lessonTitle || 'Lesson Note'}`);

    const ratingsLine = formatLessonRatings(obs);
    if (ratingsLine) lines.push(`Ratings: ${ratingsLine}`);

    const lessonDesc = cleanNoteText(obs.lessonDescription).trim();
    if (lessonDesc) lines.push(`Lesson note: ${lessonDesc}`);
    const groupComment = cleanNoteText(obs.groupComment).trim();
    if (groupComment) lines.push(`Group comment: ${groupComment}`);
    const studentComment = cleanNoteText(obs.studentComment).trim();
    if (studentComment) lines.push(`Student comment: ${studentComment}`);

    return lines.join('\n');
  };

  const formatGeneralObservation = (obs, index, date) => {
    const lines = [];
    lines.push(`${index + 1}. ${date}`);
    const author = obs.createdByName || obs.createdByEmail || obs.createdBy || 'Unknown Teacher';
    lines.push(`Author: ${author}`);
    if (obs.type === 'voice' && (obs.durationSec || obs.duration)) {
      const dur = obs.durationSec || obs.duration;
      lines.push(`[Voice note - ${dur}s]`);
    }
    const noteText = cleanNoteText(obs.text);
    if (noteText) {
      lines.push(noteText);
    }
    return lines.join('\n');
  };

  const appendObservationLines = (list) => {
    if (!list || !list.length) return '';
    return list
      .map((obs, index) => {
        const date = formatTimestampForText(obs.observedAt || obs.timestamp);
        if (obs.type === 'lesson') {
          return formatLessonObservation(obs, index, date);
        }
        return formatGeneralObservation(obs, index, date);
      })
      .join('\n\n') + '\n';
  };

  text += `${title}\n`;
  if (includeSummary) {
    text += `Total observations: ${totalCount}\n`;
  }
  text += '='.repeat(underlineLength) + '\n\n';

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

  return text;
};

// Filename + download helpers
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
    .map((segment) => String(segment || '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim())
    .filter(Boolean);

  const date = new Date().toISOString().split('T')[0];
  const parts = [cleanSubject, ...cleanSegments, `${observationCount}_Notes_${date}`];

  return `${parts.join('_')}.${extension}`;
};

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

// Group normalization (used for classroom exports)
const normalizeGroupedObservations = (groupedObservations) => {
  if (!Array.isArray(groupedObservations)) return null;
  return groupedObservations.map((group, idx) => ({
    id: group?.id || null,
    label: group?.label || group?.name || group?.id || '',
    order: Number.isFinite(group?.order) ? group.order : idx,
    observations: (group?.observations || []).map(cleanObservationData)
  }));
};

// Generic observation export (classroom/group/all)
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
  const cleanedGroups = normalizeGroupedObservations(groupedObservations);

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

// Microservice-style entry point for UI + agent workflows
export const executeExportJob = ({
  actor = {},
  subject = {},
  data = {},
  noteKinds = [NOTE_KIND.BOTH],
  format = 'txt',
  dateRange = {},
  exportType = 'observations_export',
  delivery = 'download', // 'download' | 'payload'
  textHeader,
  filenameBuilder,
  groupedObservations = null
} = {}) => {
  const baseObservations = Array.isArray(data?.observations) ? data.observations : [];
  const filtered = filterObservationsForExport({ observations: baseObservations, noteKinds, dateRange });

  if (!filtered.length) {
    return { success: false, error: 'No observations to export' };
  }

  const finalFormat = format === 'json' ? 'json' : 'txt';
  const subjectName = subject?.displayName || subject?.name || subject?.title || subject?.id || 'Observations';

  if (delivery === 'payload') {
    const cleaned = filtered.map(cleanObservationData);
    const payload = {
      exportMetadata: generateExportMetadata(actor, exportType),
      subject,
      observations: cleaned,
      summary: generateSummary(cleaned)
    };
    const filename = filenameBuilder
      ? filenameBuilder({ subject, observations: cleaned, format: finalFormat })
      : generateFilename({ subjectName, observationCount: cleaned.length, format: finalFormat });

    return {
      success: true,
      filename,
      observationCount: cleaned.length,
      format: finalFormat,
      payload
    };
  }

  return exportObservations({
    observations: filtered,
    currentUser: actor,
    format: finalFormat,
    exportType,
    subject,
    filenameBuilder,
    textHeader: textHeader || subjectName,
    groupedObservations
  });
};

// Student-specific exports
const generateStudentInfo = (student) => ({
  id: student?.id || '',
  name: student?.name || '',
  displayName: student?.displayName || '',
  firstName: student?.firstName || '',
  lastName: student?.lastName || ''
});

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

const buildStudentTextHeader = (student, noteType = null) => {
  const studentName = student?.displayName || student?.name || 'Student';
  const typeLabel = noteType === 'lesson' ? 'Lesson Notes' : noteType === 'textVoice' ? 'Observations' : 'Observation Timeline';
  return `${studentName} - ${typeLabel}`;
};

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
      const textContent = generateTextContent({
        subjectTitle: buildStudentTextHeader(student, noteType),
        observations: observationsToExport.map(cleanObservationData)
      });
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
    return {
      success: false,
      error: error.message
    };
  }
};

export const exportFilteredTimeline = (student, filteredObservations, currentUser, format = 'json', noteType = null) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, format, true, filteredObservations, noteType);
};

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

export const exportFilteredTimelineAsText = (student, filteredObservations, currentUser, noteType = null) => {
  return exportStudentTimeline(student, filteredObservations, currentUser, 'txt', true, filteredObservations, noteType);
};

export default exportObservations;

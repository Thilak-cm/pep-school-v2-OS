/**
 * Pure helper that constructs the Firestore document data for a media note.
 * Extracted from saveQueue.deriveMediaPayload so the field logic is testable
 * without Firebase dependencies.
 *
 * @param {Object} payload - Media upload payload from queue entry
 * @param {string} mediaId - Generated media doc ID
 * @param {string} storagePath - Storage path for the file
 * @returns {Object} Firestore document data (without serverTimestamp — caller adds those)
 */
export function buildMediaDocData(payload, mediaId, storagePath) {
  const kind = payload.mediaKind || 'photo';
  const itemTeacherComment = String(payload.teacherComment || '').trim();
  const displayName = String(payload.displayName || payload.source?.originalName || '').trim();

  const mediaEntry = {
    storagePath,
    contentType: payload.source?.contentType,
    sizeBytes: payload.source?.size || 0,
    ...(displayName ? { displayName } : {}),
    ...(payload.source?.originalName ? { originalName: payload.source.originalName } : {}),
    ...(payload.source?.width ? { width: payload.source.width, height: payload.source.height } : {}),
  };

  return {
    studentId: payload.studentId,
    classroomId: payload.classroomId,
    type: 'media',
    mediaKind: kind,
    status: 'pending_upload',
    media: [mediaEntry],
    createdBy: payload.createdBy || 'unknown',
    createdByName: payload.createdByName || 'Unknown Teacher',
    createdByEmail: payload.createdByEmail || 'unknown@email.com',
    ...(itemTeacherComment ? { teacherComment: itemTeacherComment } : {}),
    ...(payload.batchId ? { batchId: payload.batchId } : {}),
    ...(kind === 'pdf' && payload.pdfTitle ? { pdfTitle: payload.pdfTitle } : {}),
    ...(kind === 'pdf' && payload.pdfEssence ? { essence_text: payload.pdfEssence } : {}),
    ...(kind === 'photo' ? {
      copied: payload.copied === true,
      handwritten: payload.handwritten === true,
      curriculumArea: payload.curriculumArea || null,
      materialsIdentified: Array.isArray(payload.materialsIdentified) ? payload.materialsIdentified : [],
    } : {}),
    ...(Array.isArray(payload.linkedLessonObservationId) && payload.linkedLessonObservationId.length > 0
      ? { linkedLessonObservationId: payload.linkedLessonObservationId } : {}),
  };
}

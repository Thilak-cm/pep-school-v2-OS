/**
 * High-risk observation writes shared by production and emulator rules tests.
 *
 * Callers inject Firebase SDK functions so the frontend and root test suite can
 * use their own Firebase package instances while retaining one write contract.
 */
export function createObservationOperations({ db, firestore }) {
  const {
    arrayRemove,
    arrayUnion,
    deleteDoc,
    doc,
    serverTimestamp,
    setDoc,
    updateDoc,
  } = firestore;

  const observationRef = (studentId, observationId) => (
    doc(db, 'students', studentId, 'observations', observationId)
  );

  async function saveObservation({
    studentId,
    observationId,
    data,
    replaceExisting = false,
    onCleanupError,
  }) {
    const reference = observationRef(studentId, observationId);
    if (replaceExisting) {
      try {
        await deleteDoc(reference);
      } catch (error) {
        onCleanupError?.(error);
      }
    }
    await setDoc(reference, data);
    return reference;
  }

  function saveMediaObservation(options) {
    return saveObservation(options);
  }

  function updateObservationFields({ studentId, observationId, fields }) {
    return updateDoc(observationRef(studentId, observationId), fields);
  }

  function updateObservationText({
    studentId,
    observationId,
    text,
    editCount,
    editorUid,
  }) {
    return updateObservationFields({
      studentId,
      observationId,
      fields: {
        text,
        editCount,
        updatedAt: serverTimestamp(),
        lastEditedBy: editorUid,
        lastEditedAt: serverTimestamp(),
      },
    });
  }

  function updateMediaComment({
    studentId,
    observationId,
    teacherComment,
    editorUid,
  }) {
    return updateObservationFields({
      studentId,
      observationId,
      fields: {
        teacherComment,
        updatedAt: serverTimestamp(),
        lastEditedBy: editorUid,
        lastEditedAt: serverTimestamp(),
      },
    });
  }

  function deleteObservation({ studentId, observationId }) {
    return deleteDoc(observationRef(studentId, observationId));
  }

  async function updateLessonLinks({
    studentId,
    observationId,
    currentLessonIds,
    desiredLessonIds,
    updateForwardLink = true,
    onBacklinkError,
  }) {
    const current = [...new Set(currentLessonIds || [])].filter(Boolean);
    const desired = [...new Set(desiredLessonIds || [])].filter(Boolean);
    const added = desired.filter((lessonId) => !current.includes(lessonId));
    const removed = current.filter((lessonId) => !desired.includes(lessonId));

    if (updateForwardLink) {
      // Deliberately narrow: future collaborative-link rules can permit this
      // field without granting access to ordinary observation edits.
      await updateObservationFields({
        studentId,
        observationId,
        fields: { linkedLessonObservationId: desired },
      });
    }

    await Promise.all([
      ...added.map(async (lessonId) => {
        try {
          await updateObservationFields({
            studentId,
            observationId: lessonId,
            fields: { linkedObservations: arrayUnion(observationId) },
          });
        } catch (error) {
          onBacklinkError?.(error, lessonId, 'add');
        }
      }),
      ...removed.map(async (lessonId) => {
        try {
          await updateObservationFields({
            studentId,
            observationId: lessonId,
            fields: { linkedObservations: arrayRemove(observationId) },
          });
        } catch (error) {
          onBacklinkError?.(error, lessonId, 'remove');
        }
      }),
    ]);
  }

  return {
    deleteObservation,
    saveMediaObservation,
    saveObservation,
    updateLessonLinks,
    updateMediaComment,
    updateObservationFields,
    updateObservationText,
  };
}

/**
 * Production query definitions for the two timeline surfaces.
 *
 * The Firebase SDK functions are injected because the frontend and the
 * root-level emulator suite install Firebase in separate package scopes.
 * Both callers still execute these exact query definitions, preventing the
 * production/test query shape from drifting.
 */
export function createTimelineQueries({ db, firestore }) {
  const {
    collection,
    collectionGroup,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
  } = firestore;

  async function fetchClassroomTimelineNotes({ classroomId, pageSize, cursor = null }) {
    const constraints = [
      where('classroomId', '==', classroomId),
      orderBy('observedAt', 'desc'),
      limit(pageSize),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snapshot = await getDocs(
      query(collectionGroup(db, 'observations'), ...constraints),
    );

    return snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      parentStudentId: documentSnapshot.ref.parent?.parent?.id,
      docPath: documentSnapshot.ref.path,
      ...documentSnapshot.data(),
    }));
  }

  async function fetchStudentTimelineNotes({ studentId, pageSize, cursor = null }) {
    const constraints = [
      orderBy('observedAt', 'desc'),
      limit(pageSize),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snapshot = await getDocs(
      query(
        collection(db, 'students', studentId, 'observations'),
        ...constraints,
      ),
    );

    return snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      studentId,
      ...documentSnapshot.data(),
    }));
  }

  async function fetchActiveClassroomStudents(classroomId) {
    const snapshot = await getDocs(
      query(collection(db, 'students'), where('classroomId', '==', classroomId)),
    );

    return snapshot.docs
      .map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data(),
      }))
      .filter((student) => (student.status || 'active') === 'active');
  }

  return {
    fetchActiveClassroomStudents,
    fetchClassroomTimelineNotes,
    fetchStudentTimelineNotes,
  };
}

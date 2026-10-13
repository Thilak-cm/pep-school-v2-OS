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
    getCountFromServer,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
  } = firestore;

  /**
   * Compose optional filter constraints for authors, types, and date range.
   * Used by both fetch and count queries.
   */
  function buildFilterConstraints(filters) {
    const parts = [];
    if (filters?.authors?.length) parts.push(where('createdBy', 'in', filters.authors));
    if (filters?.types?.length) parts.push(where('type', 'in', filters.types));
    if (filters?.dateFrom != null) parts.push(where('observedAt', '>=', filters.dateFrom));
    if (filters?.dateTo != null) parts.push(where('observedAt', '<=', filters.dateTo));
    return parts;
  }

  async function fetchClassroomTimelineNotes({ classroomId, pageSize, cursor = null, filters = null }) {
    const constraints = [
      where('classroomId', '==', classroomId),
      ...buildFilterConstraints(filters),
      orderBy('observedAt', 'desc'),
      limit(pageSize),
    ];
    if (cursor) constraints.push(startAfter(cursor));

    const snapshot = await getDocs(
      query(collectionGroup(db, 'observations'), ...constraints),
    );

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    return {
      notes: snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        parentStudentId: documentSnapshot.ref.parent?.parent?.id,
        docPath: documentSnapshot.ref.path,
        ...documentSnapshot.data(),
      })),
      lastDocSnapshot: lastDoc,
    };
  }

  async function fetchStudentTimelineNotes({ studentId, pageSize, cursor = null, filters = null }) {
    const constraints = [
      ...buildFilterConstraints(filters),
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

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    return {
      notes: snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        studentId,
        ...documentSnapshot.data(),
      })),
      lastDocSnapshot: lastDoc,
    };
  }

  async function fetchFilteredCount({ scope, id, filters }) {
    const filterConstraints = buildFilterConstraints(filters);
    // Always include orderBy to align with the DESC composite indexes used by
    // the main fetch query. Without it, a range filter on observedAt implies
    // ASC direction and Firestore demands a separate ASC composite index.
    const baseConstraints = scope === 'classroom'
      ? [where('classroomId', '==', id), ...filterConstraints, orderBy('observedAt', 'desc')]
      : [...filterConstraints, orderBy('observedAt', 'desc')];
    const ref = scope === 'classroom'
      ? collectionGroup(db, 'observations')
      : collection(db, 'students', id, 'observations');
    const q = query(ref, ...baseConstraints);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  }

  async function fetchStudentBatchObservations({ studentId, batchId }) {
    if (!studentId || !batchId) return [];
    const snapshot = await getDocs(query(
      collection(db, 'students', studentId, 'observations'),
      where('batchId', '==', batchId),
    ));
    return snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      studentId,
      ...documentSnapshot.data(),
    }));
  }

  async function fetchClassroomBatchObservations({ classroomId, batchId }) {
    if (!classroomId || !batchId) return [];
    const snapshot = await getDocs(query(
      collectionGroup(db, 'observations'),
      where('classroomId', '==', classroomId),
      where('batchId', '==', batchId),
    ));
    return snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      studentId: documentSnapshot.data().studentId || documentSnapshot.ref.parent?.parent?.id,
      parentStudentId: documentSnapshot.ref.parent?.parent?.id,
      docPath: documentSnapshot.ref.path,
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
    fetchClassroomBatchObservations,
    fetchClassroomTimelineNotes,
    fetchFilteredCount,
    fetchStudentTimelineNotes,
    fetchStudentBatchObservations,
  };
}

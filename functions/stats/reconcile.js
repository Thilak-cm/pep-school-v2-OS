import {db, Timestamp, FieldPath} from "../shared/firebase.js";
import {
  AGGREGATION_STATE_VERSION,
  DEFAULT_DELTA_PAGE_SIZE,
  addObservationToDelta,
  applyDeltaToCache,
  compareCursors,
  createDeltaAccumulator,
  cursorFromObservation,
  finalizeDelta,
  isCountableObservation,
  isPendingMedia,
  reconcileCrossClassroomCounts,
} from "./delta.js";

export const FIRESTORE_RETRY_ATTEMPTS = 3;
const TRANSIENT_CODES = new Set(["aborted", "deadline-exceeded", "internal", "resource-exhausted", "unavailable", 4, 8, 10, 13, 14]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isTransientFirestoreError(error) {
  const code = typeof error?.code === "string" ? error.code.replace(/^firestore\//, "") : error?.code;
  return TRANSIENT_CODES.has(code);
}

export async function withFirestoreRetry(operation, attempts = FIRESTORE_RETRY_ATTEMPTS, sleep = delay) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFirestoreError(error) || attempt === attempts) break;
      await sleep(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function normalizeDocument(doc) {
  const data = typeof doc.data === "function" ? doc.data() : doc;
  return {...data, id: doc.id || data.id, path: doc.ref?.path || data.path};
}

const groupKey = (observation) => `${observation.classroomId}\u0000${observation.groupId}`;

/** Resolve a stable representative for each fan-out group, including siblings from prior runs. */
export async function resolveCanonicalGroupCursors(observations, database = db) {
  const groupIds = [...new Set(observations.map((item) => item.groupId).filter(Boolean))];
  const canonical = new Map();
  for (let offset = 0; offset < groupIds.length; offset += 30) {
    const ids = groupIds.slice(offset, offset + 30);
    const snap = await withFirestoreRetry(() => database.collectionGroup("observations").where("groupId", "in", ids).get());
    for (const doc of snap.docs) {
      const observation = normalizeDocument(doc);
      if (!observation.classroomId || !isCountableObservation(observation)) continue;
      const key = groupKey(observation);
      const cursor = cursorFromObservation(observation);
      if (!canonical.has(key) || compareCursors(cursor, canonical.get(key)) < 0) canonical.set(key, cursor);
    }
  }
  return canonical;
}

/**
 * Compact one page and report whether a pending-media/cutoff barrier stopped it.
 *
 * skipPendingMedia (delta path): advance the cursor past pending media docs
 * instead of blocking. The doc is still excluded from counts via
 * isCountableObservation, but the cursor is not stalled. This prevents a
 * single orphaned upload from permanently blocking all delta refreshes.
 * Weekly reconciliation uses stopBeforeCursor instead and does NOT skip.
 *
 * COUPLING: if media upload reliability is fixed so that pending_upload docs
 * can no longer become orphaned, revisit this flag and consider removing
 * isPendingMedia from the blocking path entirely. See:
 *   - montessori-os/src/utils/mediaDocBuilder.js (sets status: 'pending_upload')
 *   - functions/media/index.js mediaFinalize (transitions to 'ready' or 'failed')
 *   - functions/stats/delta.js isPendingMedia (defines the barrier condition)
 */
export function aggregateObservationPage(state, observations, canonicalGroups = new Map(), stopBeforeCursor = null, {skipPendingMedia = false} = {}) {
  let blocked = false;
  for (const observation of observations) {
    const cursor = cursorFromObservation(observation);
    if (stopBeforeCursor && compareCursors(cursor, stopBeforeCursor) >= 0) {
      blocked = true;
      state.blockedByPendingMedia = true;
      break;
    }
    if (isPendingMedia(observation)) {
      if (skipPendingMedia) {
        // Delta path: log and advance past. The observation is excluded from
        // counts by isCountableObservation but does not stall the cursor.
        state.skippedPendingMedia = (state.skippedPendingMedia || 0) + 1;
        state.latestCursor = cursor;
        continue;
      }
      blocked = true;
      state.blockedByPendingMedia = true;
      break;
    }
    state.latestCursor = cursor;
    if (!isCountableObservation(observation)) continue;
    const canonical = !observation.groupId || compareCursors(cursor, canonicalGroups.get(groupKey(observation))) === 0;
    addObservationToDelta(state, observation, {countAction: canonical});
  }
  state.pageCount++;
  return {state, blocked};
}

export async function findEarliestPendingMedia(database = db, {
  onPageReleased = () => {},
} = {}) {
  let pageCursor = null;
  while (true) {
    // Scan every media status so legacy or unexpected not-ready values cannot be
    // missed by a status-specific query and then stranded behind the checkpoint.
    let query = database.collectionGroup("observations")
      .where("type", "==", "media")
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(DEFAULT_DELTA_PAGE_SIZE);
    if (pageCursor) {
      query = query.startAfter(pageCursor.createdAt, pageCursor.documentPath);
    }
    const snap = await withFirestoreRetry(() => query.get());
    const page = snap.docs.map(normalizeDocument);
    const pending = page.find(isPendingMedia);
    onPageReleased(page.length);
    if (pending) return cursorFromObservation(pending);
    if (page.length < DEFAULT_DELTA_PAGE_SIZE) return null;
    pageCursor = cursorFromObservation(page[page.length - 1]);
  }
}

export async function collectClassroomAggregate(classroomId, {
  database = db,
  now = new Date(),
  stopBeforeCursor = null,
  onPageReleased = () => {},
} = {}) {
  const state = createDeltaAccumulator(now);
  let pageCursor = null;
  while (true) {
    let query = database.collectionGroup("observations")
      .where("classroomId", "==", classroomId)
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(DEFAULT_DELTA_PAGE_SIZE);
    if (pageCursor) query = query.startAfter(pageCursor.createdAt, pageCursor.documentPath);
    const snap = await withFirestoreRetry(() => query.get());
    const page = snap.docs.map(normalizeDocument);
    const canonical = await resolveCanonicalGroupCursors(page, database);
    const result = aggregateObservationPage(state, page, canonical, stopBeforeCursor);
    onPageReleased(page.length);
    if (result.blocked || page.length < DEFAULT_DELTA_PAGE_SIZE) break;
    pageCursor = cursorFromObservation(page[page.length - 1]);
  }
  return finalizeDelta(state);
}

function createTeacherRow(user, id) {
  return {id, name: user?.displayName || user?.email || "Unknown", email: user?.email || "", status: user?.status || "active", observations: 0, lessons: 0, media: 0, handwritten: 0, observations7d: 0, lessons7d: 0, media7d: 0, handwritten7d: 0, observations30d: 0, lessons30d: 0, media30d: 0, handwritten30d: 0, otherNotes7d: 0, otherCount7d: 0, otherNotes30d: 0, otherCount30d: 0};
}

function createStudentRow(student) {
  return {id: student.id, name: student.displayName || student.name || "Unknown Student", status: student.status || "active", totalMentions: 0, thisWeekMentions: 0, last14DaysMentions: 0, last42DaysMentions: 0, mediaMentions: 0, mediaThisWeek: 0, mediaLast14Days: 0, mediaLast42Days: 0, handwrittenMentions: 0, handwrittenThisWeek: 0, handwrittenLast14Days: 0, handwrittenLast42Days: 0};
}

export function buildClassroomCache(classroom, students, usersById, aggregate, now = new Date()) {
  const teachers = [...new Set(classroom.teacherIds || [])].map((id) => createTeacherRow(usersById.get(id), id));
  const base = {
    cachedAt: Timestamp.fromDate(now), classroomId: classroom.id,
    classroomName: classroom.name || classroom.id, branchId: classroom.branchId || null,
    effortCounts: {voice: 0, text: 0, lesson: 0, media: 0, total: 0},
    effortActivity: {}, effortActivityByType: {}, studentCount: students.length,
    teachers, students: students.map(createStudentRow),
    aggregationState: {version: AGGREGATION_STATE_VERSION, teacherRecent: {}, studentRecent: {}},
  };
  const cache = applyDeltaToCache(base, aggregate, now);
  cache.teachers = cache.teachers.filter((teacher) => {
    const isGhost = !usersById.has(teacher.id) || teacher.id.startsWith("pending_");
    return !isGhost || teacher.observations + teacher.lessons + teacher.media > 0;
  });
  return cache;
}

export async function reconcileAllStats({database = db, now = new Date()} = {}) {
  const [classroomsSnap, studentsSnap, usersSnap, pendingCursor] = await Promise.all([
    withFirestoreRetry(() => database.collection("classrooms").where("status", "==", "active").get()),
    withFirestoreRetry(() => database.collection("students").get()),
    withFirestoreRetry(() => database.collection("users").get()),
    findEarliestPendingMedia(database),
  ]);
  const classrooms = classroomsSnap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  const studentsByClassroom = new Map();
  for (const doc of studentsSnap.docs) {
    const student = {id: doc.id, ...doc.data()};
    if ((student.status || "active") !== "active" || !student.classroomId) continue;
    if (!studentsByClassroom.has(student.classroomId)) studentsByClassroom.set(student.classroomId, []);
    studentsByClassroom.get(student.classroomId).push(student);
  }
  const usersById = new Map();
  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (["teacher", "superadmin", "classroomadmin"].includes(user.role)) usersById.set(doc.id, {id: doc.id, ...user});
  }
  const results = [];
  let latestCursor = null;
  for (const classroom of classrooms) {
    const delta = await collectClassroomAggregate(classroom.id, {database, now, stopBeforeCursor: pendingCursor});
    if (delta.latestCursor && (!latestCursor || compareCursors(latestCursor, delta.latestCursor) < 0)) latestCursor = delta.latestCursor;
    results.push(buildClassroomCache(classroom, studentsByClassroom.get(classroom.id) || [], usersById, delta.classrooms.get(classroom.id), now));
  }
  return {
    classrooms: reconcileCrossClassroomCounts(results, now),
    classroomCount: results.length,
    latestCursor: latestCursor || {createdAt: Timestamp.fromMillis(0), documentPath: ""},
    blockedByPendingMedia: Boolean(pendingCursor),
  };
}

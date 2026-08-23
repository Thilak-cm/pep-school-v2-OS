import {db, Timestamp} from "../shared/firebase.js";
import {
  classifyNote,
  getObservationDate,
  buildActivityTiers,
  deduplicateObservations,
} from "./helpers.js";
import {DEFAULT_DELTA_PAGE_SIZE, compareCursors, cursorFromObservation} from "./delta.js";

export const RECONCILE_RETRY_ATTEMPTS = 3;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withFirestoreRetry(operation, attempts = RECONCILE_RETRY_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function emptyCounts() {
  return {voice: 0, text: 0, lesson: 0, media: 0, total: 0};
}

function emptyTierSet() {
  return {daily: {}, weekly: {}, monthly: {}};
}

function countEffort(observations) {
  const counts = emptyCounts();
  for (const observation of observations) {
    const type = classifyNote(observation);
    if (type in counts) counts[type]++;
    counts.total++;
  }
  return counts;
}

function createTeacherRow(user, id) {
  return {
    id,
    name: user?.displayName || user?.email || "Unknown",
    email: user?.email || "",
    status: user?.status || "active",
    observations: 0, lessons: 0, media: 0, handwritten: 0,
    observations7d: 0, lessons7d: 0, media7d: 0, handwritten7d: 0,
    observations30d: 0, lessons30d: 0, media30d: 0, handwritten30d: 0,
    otherNotes7d: 0, otherCount7d: 0, otherNotes30d: 0, otherCount30d: 0,
  };
}

function incrementTeacher(row, observation, nowMs) {
  const type = classifyNote(observation);
  const date = getObservationDate(observation).getTime();
  const in7d = date >= nowMs - 7 * 24 * 60 * 60 * 1000;
  const in30d = date >= nowMs - 30 * 24 * 60 * 60 * 1000;
  if (type === "lesson") {
    row.lessons++;
    if (in7d) row.lessons7d++;
    if (in30d) row.lessons30d++;
  } else if (type === "media") {
    row.media++;
    if (in7d) row.media7d++;
    if (in30d) row.media30d++;
    if (observation.handwritten) {
      row.handwritten++;
      if (in7d) row.handwritten7d++;
      if (in30d) row.handwritten30d++;
    }
  } else {
    row.observations++;
    if (in7d) row.observations7d++;
    if (in30d) row.observations30d++;
  }
}

function createStudentRow(student) {
  return {
    id: student.id,
    name: student.displayName || student.name || "Unknown Student",
    status: student.status || "active",
    totalMentions: 0, thisWeekMentions: 0, last14DaysMentions: 0,
    last42DaysMentions: 0, mediaMentions: 0, mediaThisWeek: 0,
    mediaLast14Days: 0, mediaLast42Days: 0, handwrittenMentions: 0,
    handwrittenThisWeek: 0, handwrittenLast14Days: 0,
    handwrittenLast42Days: 0,
  };
}

function incrementStudent(row, observation, nowMs) {
  const date = getObservationDate(observation).getTime();
  const type = classifyNote(observation);
  row.totalMentions++;
  if (date >= nowMs - 7 * 86400000) row.thisWeekMentions++;
  if (date >= nowMs - 14 * 86400000) row.last14DaysMentions++;
  if (date >= nowMs - 42 * 86400000) row.last42DaysMentions++;
  if (type !== "media") return;
  row.mediaMentions++;
  if (date >= nowMs - 7 * 86400000) row.mediaThisWeek++;
  if (date >= nowMs - 14 * 86400000) row.mediaLast14Days++;
  if (date >= nowMs - 42 * 86400000) row.mediaLast42Days++;
  if (!observation.handwritten) return;
  row.handwrittenMentions++;
  if (date >= nowMs - 7 * 86400000) row.handwrittenThisWeek++;
  if (date >= nowMs - 14 * 86400000) row.handwrittenLast14Days++;
  if (date >= nowMs - 42 * 86400000) row.handwrittenLast42Days++;
}

function normalizedObservation(doc) {
  const data = doc.data();
  if (data.type === "media" && data.status !== "ready") return null;
  return {...data, id: doc.id, path: doc.ref.path, classroomId: data.classroomId};
}

export function buildClassroomCache(classroom, students, usersById, observations, now = new Date()) {
  const deduped = deduplicateObservations(observations);
  const effortActivityByType = {voice: emptyTierSet(), text: emptyTierSet(), lesson: emptyTierSet(), media: emptyTierSet()};
  for (const type of Object.keys(effortActivityByType)) {
    effortActivityByType[type] = buildActivityTiers(
      deduped.filter((observation) => classifyNote(observation) === type), now,
    );
  }
  const teachers = [...new Set(classroom.teacherIds || [])].map((id) => {
    const row = createTeacherRow(usersById.get(id), id);
    for (const observation of deduped.filter((item) => item.createdBy === id)) {
      incrementTeacher(row, observation, now.getTime());
    }
    return row;
  }).filter((row) => usersById.has(row.id) || row.observations + row.lessons + row.media > 0);
  const studentsById = new Map(students.map((student) => [student.id, createStudentRow(student)]));
  for (const observation of observations) {
    if (studentsById.has(observation.studentId)) incrementStudent(
      studentsById.get(observation.studentId), observation, now.getTime(),
    );
  }
  return {
    cachedAt: Timestamp.fromDate(now),
    classroomId: classroom.id,
    classroomName: classroom.name || classroom.id,
    branchId: classroom.branchId || null,
    effortCounts: countEffort(deduped),
    effortActivity: buildActivityTiers(deduped, now),
    effortActivityByType,
    studentCount: students.length,
    teachers,
    students: [...studentsById.values()],
  };
}

export async function collectClassroom(classroomId) {
  const observations = [];
  let lastDoc = null;
  while (true) {
    // The classroomId + createdAt index lets reconciliation jump through one
    // classroom's source stream without materializing every classroom first.
    let query = db.collectionGroup("observations")
      .where("classroomId", "==", classroomId)
      .orderBy("createdAt", "asc")
      .limit(DEFAULT_DELTA_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await withFirestoreRetry(() => query.get());
    for (const doc of snap.docs) {
      const observation = normalizedObservation(doc);
      if (observation) observations.push(observation);
    }
    if (snap.size < DEFAULT_DELTA_PAGE_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return observations;
}

export async function reconcileAllStats() {
  const [classroomsSnap, studentsSnap, usersSnap] = await Promise.all([
    withFirestoreRetry(() => db.collection("classrooms").where("status", "==", "active").get()),
    withFirestoreRetry(() => db.collection("students").get()),
    withFirestoreRetry(() => db.collection("users").get()),
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
    if (["teacher", "superadmin", "classroomadmin"].includes(user.role)) {
      usersById.set(doc.id, {id: doc.id, ...user});
    }
  }
  const now = new Date();
  const results = [];
  let latestCursor = null;
  for (const classroom of classrooms) {
    const observations = await collectClassroom(classroom.id);
    for (const observation of observations) {
      const cursor = cursorFromObservation(observation);
      if (!latestCursor || compareCursors(latestCursor, cursor) < 0) latestCursor = cursor;
    }
    results.push(buildClassroomCache(
      classroom, studentsByClassroom.get(classroom.id) || [], usersById, observations, now,
    ));
  }
  // Cross-classroom teacher counts are derived after each classroom has been
  // compacted. This keeps raw observations out of memory while preserving the
  // old cache contract for teachers assigned to more than one classroom.
  const teacherRows = new Map();
  for (const classroom of results) {
    for (const teacher of classroom.teachers) {
      if (!teacherRows.has(teacher.id)) teacherRows.set(teacher.id, []);
      teacherRows.get(teacher.id).push({classroomId: classroom.classroomId, teacher});
    }
  }
  for (const classroom of results) {
    for (const teacher of classroom.teachers) {
      const others = (teacherRows.get(teacher.id) || []).filter((item) => item.classroomId !== classroom.classroomId);
      teacher.otherNotes7d = others.reduce((sum, item) => sum + item.teacher.observations7d + item.teacher.lessons7d + item.teacher.media7d, 0);
      teacher.otherNotes30d = others.reduce((sum, item) => sum + item.teacher.observations30d + item.teacher.lessons30d + item.teacher.media30d, 0);
      teacher.otherCount7d = others.filter((item) => item.teacher.observations7d + item.teacher.lessons7d + item.teacher.media7d > 0).length;
      teacher.otherCount30d = others.filter((item) => item.teacher.observations30d + item.teacher.lessons30d + item.teacher.media30d > 0).length;
    }
  }
  return {classrooms: results, classroomCount: results.length, latestCursor, usersById};
}

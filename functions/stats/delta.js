import {
  classifyNote,
  buildActivityTiers,
} from "./helpers.js";

export const DEFAULT_DELTA_PAGE_SIZE = 1000;

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (value.seconds != null) return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime() || 0;
}

export function cursorFromObservation(observation) {
  const data = typeof observation.data === "function"
    ? observation.data()
    : observation;
  const path = observation.ref?.path || observation.path || data.path || data.id;
  return {
    createdAtMs: timestampMs(data.createdAt),
    documentPath: path,
  };
}

export function compareCursors(left = {}, right = {}) {
  if (left.createdAtMs !== right.createdAtMs) {
    return left.createdAtMs < right.createdAtMs ? -1 : 1;
  }
  if (left.documentPath === right.documentPath) return 0;
  return String(left.documentPath || "") < String(right.documentPath || "")
    ? -1
    : 1;
}

function compactObservation(observation) {
  return {
    id: observation.id,
    path: observation.path,
    classroomId: observation.classroomId,
    studentId: observation.studentId,
    createdBy: observation.createdBy,
    type: observation.type,
    lessonTitle: observation.lessonTitle,
    duration: observation.duration,
    durationSec: observation.durationSec,
    handwritten: observation.handwritten === true,
    groupId: observation.groupId || null,
    observedAt: observation.observedAt || observation.createdAt,
    createdAt: observation.createdAt,
  };
}

export function createDeltaAccumulator() {
  return {
    actionsByKey: new Map(),
    studentMentions: [],
    latestCursor: null,
  };
}

export function addObservationToDelta(state, observation) {
  const compact = compactObservation(observation);
  const classroomKey = compact.classroomId || "__unknown__";
  const actionKey = compact.groupId
    ? `${classroomKey}:group:${compact.groupId}`
    : `${classroomKey}:doc:${compact.path || compact.id}`;

  if (!state.actionsByKey.has(actionKey)) {
    state.actionsByKey.set(actionKey, compact);
  }
  state.studentMentions.push(compact);

  const cursor = cursorFromObservation(observation);
  if (!state.latestCursor || compareCursors(state.latestCursor, cursor) < 0) {
    state.latestCursor = cursor;
  }
  return state;
}

function emptyCounts() {
  return {voice: 0, text: 0, lesson: 0, media: 0, assessment: 0, total: 0};
}

export function finalizeDelta(state, now = new Date()) {
  const actions = [...state.actionsByKey.values()];
  const effortCounts = emptyCounts();
  for (const action of actions) {
    const type = classifyNote(action);
    if (type in effortCounts) effortCounts[type]++;
    effortCounts.total++;
  }

  const actionsByClassroom = new Map();
  for (const action of actions) {
    const key = action.classroomId || "__unknown__";
    if (!actionsByClassroom.has(key)) actionsByClassroom.set(key, []);
    actionsByClassroom.get(key).push(action);
  }
  const mentionsByClassroom = new Map();
  for (const mention of state.studentMentions) {
    const key = mention.classroomId || "__unknown__";
    if (!mentionsByClassroom.has(key)) mentionsByClassroom.set(key, []);
    mentionsByClassroom.get(key).push(mention);
  }

  return {
    actions,
    studentMentions: state.studentMentions,
    effortCounts,
    effortActivity: buildActivityTiers(actions, now),
    actionsByClassroom,
    mentionsByClassroom,
    latestCursor: state.latestCursor,
  };
}

function addCounts(base = emptyCounts(), delta = emptyCounts()) {
  return Object.fromEntries(Object.keys(emptyCounts()).map((key) => [
    key,
    (base[key] || 0) + (delta[key] || 0),
  ]));
}

export function mergeStatsDelta(cache, delta) {
  return {
    ...cache,
    effortCounts: addCounts(cache.effortCounts, delta.effortCounts),
  };
}

function mergeTiers(existing = {}, added = {}) {
  const result = {};
  for (const key of Object.keys(added)) {
    result[key] = (existing[key] || 0) + (added[key] || 0);
  }
  return result;
}

function mergeTierSet(existing = {}, added = {}) {
  return {
    daily: mergeTiers(existing.daily, added.daily),
    weekly: mergeTiers(existing.weekly, added.weekly),
    monthly: mergeTiers(existing.monthly, added.monthly),
  };
}

function incrementTeacherRow(row, observation, nowMs) {
  const date = timestampMs(observation.observedAt);
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = nowMs - 30 * 24 * 60 * 60 * 1000;
  const type = classifyNote(observation);
  if (type === "lesson") row.lessons++;
  else if (type === "media") {
    row.media++;
    if (observation.handwritten) row.handwritten++;
  } else if (type === "assessment") {
    row.assessments++;
  } else row.observations++;

  const suffix = type === "lesson"
    ? "lessons"
    : type === "media" ? "media" : type === "assessment" ? "assessments" : "observations";
  if (date >= weekAgo) row[`${suffix}7d`]++;
  if (date >= monthAgo) row[`${suffix}30d`]++;
  if (type === "media" && observation.handwritten) {
    if (date >= weekAgo) row.handwritten7d++;
    if (date >= monthAgo) row.handwritten30d++;
  }
}

function incrementStudentRow(row, observation, nowMs) {
  const date = timestampMs(observation.observedAt);
  const type = classifyNote(observation);
  row.totalMentions++;
  if (date >= nowMs - 7 * 24 * 60 * 60 * 1000) row.thisWeekMentions++;
  if (date >= nowMs - 14 * 24 * 60 * 60 * 1000) row.last14DaysMentions++;
  if (date >= nowMs - 42 * 24 * 60 * 60 * 1000) row.last42DaysMentions++;
  if (type !== "media") return;
  row.mediaMentions++;
  if (date >= nowMs - 7 * 24 * 60 * 60 * 1000) row.mediaThisWeek++;
  if (date >= nowMs - 14 * 24 * 60 * 60 * 1000) row.mediaLast14Days++;
  if (date >= nowMs - 42 * 24 * 60 * 60 * 1000) row.mediaLast42Days++;
  if (observation.handwritten) {
    row.handwrittenMentions++;
    if (date >= nowMs - 7 * 24 * 60 * 60 * 1000) row.handwrittenThisWeek++;
    if (date >= nowMs - 14 * 24 * 60 * 60 * 1000) row.handwrittenLast14Days++;
    if (date >= nowMs - 42 * 24 * 60 * 60 * 1000) row.handwrittenLast42Days++;
  }
}

/**
 * Merge a complete compact delta into one existing classroom cache doc.
 * `createdAt` selected the input; `observedAt` is deliberately used here for
 * graph windows because graphs describe when the classroom event happened.
 */
export function applyDeltaToCache(cache, delta, allActions, now = new Date()) {
  const nowMs = now.getTime();
  const actions = delta.actions || [];
  const mentions = delta.studentMentions || [];
  const activityAdded = buildActivityTiers(actions, now);
  const byType = {voice: [], text: [], lesson: [], media: [], assessment: []};
  for (const action of actions) {
    const type = classifyNote(action);
    if (type in byType) byType[type].push(action);
  }
  const existingTypes = cache.effortActivityByType || {};
  const effortActivityByType = {};
  for (const type of Object.keys(byType)) {
    effortActivityByType[type] = mergeTierSet(
      existingTypes[type],
      buildActivityTiers(byType[type], now),
    );
  }

  const next = mergeStatsDelta(cache, {
    effortCounts: (() => {
      const counts = emptyCounts();
      for (const action of actions) {
        const type = classifyNote(action);
        if (type in counts) counts[type]++;
        counts.total++;
      }
      return counts;
    })(),
  });
  next.effortActivity = mergeTierSet(cache.effortActivity, activityAdded);
  next.effortActivityByType = effortActivityByType;

  const teacherActions = allActions || actions;
  next.teachers = (cache.teachers || []).map((teacher) => {
    const local = actions.filter((action) => action.createdBy === teacher.id);
    const other = teacherActions.filter((action) => (
      action.createdBy === teacher.id && action.classroomId !== cache.classroomId
    ));
    const row = {...teacher};
    for (const action of local) incrementTeacherRow(row, action, nowMs);
    const otherClassrooms7d = new Set();
    const otherClassrooms30d = new Set();
    for (const action of other) {
      const date = timestampMs(action.observedAt);
      if (date >= nowMs - 7 * 24 * 60 * 60 * 1000) otherClassrooms7d.add(action.classroomId);
      if (date >= nowMs - 30 * 24 * 60 * 60 * 1000) otherClassrooms30d.add(action.classroomId);
      const otherRow = {observations: 0, lessons: 0, media: 0, assessments: 0, handwritten: 0, observations7d: 0, lessons7d: 0, media7d: 0, assessments7d: 0, handwritten7d: 0, observations30d: 0, lessons30d: 0, media30d: 0, assessments30d: 0, handwritten30d: 0};
      incrementTeacherRow(otherRow, action, nowMs);
      row.otherNotes7d += otherRow.observations7d + otherRow.lessons7d + otherRow.media7d + otherRow.assessments7d;
      row.otherNotes30d += otherRow.observations30d + otherRow.lessons30d + otherRow.media30d + otherRow.assessments30d;
    }
    row.otherCount7d += otherClassrooms7d.size;
    row.otherCount30d += otherClassrooms30d.size;
    return row;
  });

  const mentionsByStudent = new Map();
  for (const mention of mentions) {
    if (!mentionsByStudent.has(mention.studentId)) mentionsByStudent.set(mention.studentId, []);
    mentionsByStudent.get(mention.studentId).push(mention);
  }
  next.students = (cache.students || []).map((student) => {
    const row = {...student};
    for (const mention of mentionsByStudent.get(student.id) || []) {
      incrementStudentRow(row, mention, nowMs);
    }
    return row;
  });
  return next;
}

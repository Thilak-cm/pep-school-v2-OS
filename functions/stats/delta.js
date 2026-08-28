import {
  classifyNote,
  createActivityTiers,
  incrementActivityTiers,
  normalizeActivityTiers,
} from "./helpers.js";

export const DEFAULT_DELTA_PAGE_SIZE = 1000;
export const AGGREGATION_STATE_VERSION = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function timestampParts(value) {
  if (!value) return {seconds: 0, nanoseconds: 0};
  if (value.seconds != null) return {seconds: Number(value.seconds), nanoseconds: Number(value.nanoseconds ?? value._nanoseconds ?? 0)};
  if (value._seconds != null) return {seconds: Number(value._seconds), nanoseconds: Number(value._nanoseconds || 0)};
  const millis = typeof value.toMillis === "function" ? value.toMillis() : value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(millis)) return {seconds: 0, nanoseconds: 0};
  const seconds = Math.floor(millis / 1000);
  return {seconds, nanoseconds: Math.floor((millis - seconds * 1000) * 1e6)};
}

function timestampMs(value) {
  const {seconds, nanoseconds} = timestampParts(value);
  return seconds * 1000 + nanoseconds / 1e6;
}

export function cursorFromObservation(observation) {
  const data = typeof observation.data === "function" ? observation.data() : observation;
  return {
    createdAt: data.createdAt,
    documentPath: observation.ref?.path || observation.path || data.path || data.id || "",
  };
}

export function compareCursors(left = {}, right = {}) {
  const leftTime = timestampParts(left.createdAt);
  const rightTime = timestampParts(right.createdAt);
  if (leftTime.seconds !== rightTime.seconds) return leftTime.seconds < rightTime.seconds ? -1 : 1;
  if (leftTime.nanoseconds !== rightTime.nanoseconds) return leftTime.nanoseconds < rightTime.nanoseconds ? -1 : 1;
  const leftPath = String(left.documentPath || "");
  const rightPath = String(right.documentPath || "");
  if (leftPath === rightPath) return 0;
  return leftPath < rightPath ? -1 : 1;
}

/**
 * A media observation that has not reached a terminal status ('ready' or 'failed').
 *
 * Delta stats skip past these docs (skipPendingMedia in reconcile.js
 * aggregateObservationPage) so a single orphaned upload cannot permanently
 * stall teacher-triggered refreshes. Weekly reconciliation still blocks on
 * them via stopBeforeCursor from findEarliestPendingMedia.
 *
 * COUPLING: if the media upload flow (mediaDocBuilder.js sets 'pending_upload',
 * functions/media/index.js mediaFinalize transitions to 'ready'/'failed') is
 * fixed to guarantee terminal status, this barrier can be removed and
 * aggregateObservationPage's skipPendingMedia flag can be dropped.
 */
export function isPendingMedia(observation = {}) {
  return observation.type === "media" && observation.status !== "ready" && observation.status !== "failed";
}

export function isCountableObservation(observation = {}) {
  return observation.type !== "media" || observation.status === "ready";
}

const emptyCounts = () => ({voice: 0, text: 0, lesson: 0, media: 0, total: 0});
const emptyTeacherCounts = () => ({observations: 0, lessons: 0, media: 0, handwritten: 0});
const emptyStudentCounts = () => ({totalMentions: 0, mediaMentions: 0, handwrittenMentions: 0});
const emptyTeacherDayCounts = () => ({observations: 0, lessons: 0, media: 0, handwritten: 0});
const emptyStudentDayCounts = () => ({mentions: 0, media: 0, handwritten: 0});
const dayKey = (atMs) => String(Math.floor(atMs / DAY_MS));
const windowCutoffDay = (nowMs, days) => Math.floor(nowMs / DAY_MS) - days + 1;
const isInDayWindow = (atMs, nowMs, days) => {
  const day = Number(dayKey(atMs));
  const currentDay = Math.floor(nowMs / DAY_MS);
  return day >= windowCutoffDay(nowMs, days) && day <= currentDay;
};

function emptyClassroomDelta(now) {
  return {
    effortCounts: emptyCounts(),
    effortActivity: createActivityTiers(now),
    effortActivityByType: Object.fromEntries(["voice", "text", "lesson", "media"].map((type) => [type, createActivityTiers(now)])),
    teacherTotals: new Map(), teacherRecent: new Map(),
    studentTotals: new Map(), studentRecent: new Map(),
    actionCount: 0, mentionCount: 0,
  };
}

export function createDeltaAccumulator(now = new Date()) {
  return {now, classrooms: new Map(), latestCursor: null, pageCount: 0, blockedByPendingMedia: false};
}

function classroomDelta(state, classroomId) {
  if (!state.classrooms.has(classroomId)) state.classrooms.set(classroomId, emptyClassroomDelta(state.now));
  return state.classrooms.get(classroomId);
}

function incrementMap(map, id, factory, updater) {
  if (!id) return;
  const value = map.get(id) || factory();
  updater(value);
  map.set(id, value);
}

function incrementRecent(map, id, atMs, factory, updater) {
  if (!id || !Number.isFinite(atMs)) return;
  if (!map.has(id)) map.set(id, new Map());
  const days = map.get(id);
  const key = dayKey(atMs);
  const counts = days.get(key) || factory();
  updater(counts);
  days.set(key, counts);
}

export function addObservationToDelta(state, observation, {countAction = true} = {}) {
  if (!observation.classroomId) return state;
  const aggregate = classroomDelta(state, observation.classroomId);
  const observedAtMs = timestampMs(observation.observedAt || observation.createdAt);
  const type = classifyNote(observation);

  aggregate.mentionCount++;
  incrementMap(aggregate.studentTotals, observation.studentId, emptyStudentCounts, (counts) => {
    counts.totalMentions++;
    if (type === "media") {
      counts.mediaMentions++;
      if (observation.handwritten === true) counts.handwrittenMentions++;
    }
  });
  if (isInDayWindow(observedAtMs, state.now.getTime(), 42)) {
    incrementRecent(aggregate.studentRecent, observation.studentId, observedAtMs, emptyStudentDayCounts, (counts) => {
      counts.mentions++;
      if (type === "media") {
        counts.media++;
        if (observation.handwritten === true) counts.handwritten++;
      }
    });
  }

  if (!countAction) return state;
  aggregate.actionCount++;
  if (type in aggregate.effortCounts) aggregate.effortCounts[type]++;
  aggregate.effortCounts.total++;
  incrementActivityTiers(aggregate.effortActivity, observation, state.now);
  if (aggregate.effortActivityByType[type]) incrementActivityTiers(aggregate.effortActivityByType[type], observation, state.now);
  incrementMap(aggregate.teacherTotals, observation.createdBy, emptyTeacherCounts, (counts) => {
    if (type === "lesson") counts.lessons++;
    else if (type === "media") {
      counts.media++;
      if (observation.handwritten === true) counts.handwritten++;
    } else counts.observations++;
  });
  if (isInDayWindow(observedAtMs, state.now.getTime(), 30)) {
    incrementRecent(aggregate.teacherRecent, observation.createdBy, observedAtMs, emptyTeacherDayCounts, (counts) => {
      if (type === "lesson") counts.lessons++;
      else if (type === "media") {
        counts.media++;
        if (observation.handwritten === true) counts.handwritten++;
      } else counts.observations++;
    });
  }
  return state;
}

const serializeRecent = (map) => Object.fromEntries([...map.entries()].map(([id, days]) => [id, Object.fromEntries(days)]));

export function finalizeDelta(state) {
  return {
    ...state,
    classrooms: new Map([...state.classrooms.entries()].map(([id, aggregate]) => [id, {
      ...aggregate,
      teacherTotals: Object.fromEntries(aggregate.teacherTotals),
      teacherRecent: serializeRecent(aggregate.teacherRecent),
      studentTotals: Object.fromEntries(aggregate.studentTotals),
      studentRecent: serializeRecent(aggregate.studentRecent),
    }])),
  };
}

function addCounts(base = {}, added = {}) {
  return Object.fromEntries(Object.keys(added).map((key) => [key, (base[key] || 0) + (added[key] || 0)]));
}

function mergeActivity(existing, added, now) {
  const result = normalizeActivityTiers(existing, now);
  for (const tier of ["daily", "weekly", "monthly"]) {
    for (const key of Object.keys(result[tier])) result[tier][key] += added?.[tier]?.[key] || 0;
  }
  return result;
}

function mergeRecent(existing = {}, added = {}, cutoffDay, currentDay, factory) {
  const merged = {};
  for (const source of [existing, added]) {
    for (const [key, counts] of Object.entries(source || {})) {
      const day = Number(key);
      if (!Number.isInteger(day) || day < cutoffDay || day > currentDay) continue;
      const current = merged[key] || factory();
      for (const field of Object.keys(current)) current[field] += counts?.[field] || 0;
      merged[key] = current;
    }
  }
  return merged;
}

function teacherWindows(days, nowMs) {
  const result = {observations7d: 0, lessons7d: 0, media7d: 0, handwritten7d: 0, observations30d: 0, lessons30d: 0, media30d: 0, handwritten30d: 0};
  for (const [key, counts] of Object.entries(days || {})) {
    const day = Number(key);
    if (day > Math.floor(nowMs / DAY_MS)) continue;
    for (const [days, suffix] of [[7, "7d"], [30, "30d"]]) {
      if (day < windowCutoffDay(nowMs, days)) continue;
      result[`observations${suffix}`] += counts.observations || 0;
      result[`lessons${suffix}`] += counts.lessons || 0;
      result[`media${suffix}`] += counts.media || 0;
      result[`handwritten${suffix}`] += counts.handwritten || 0;
    }
  }
  return result;
}

function studentWindows(days, nowMs) {
  const result = {thisWeekMentions: 0, last14DaysMentions: 0, last42DaysMentions: 0, mediaThisWeek: 0, mediaLast14Days: 0, mediaLast42Days: 0, handwrittenThisWeek: 0, handwrittenLast14Days: 0, handwrittenLast42Days: 0};
  for (const [key, counts] of Object.entries(days || {})) {
    const day = Number(key);
    if (day > Math.floor(nowMs / DAY_MS)) continue;
    for (const [days, mentionField, suffix] of [[7, "thisWeekMentions", "ThisWeek"], [14, "last14DaysMentions", "Last14Days"], [42, "last42DaysMentions", "Last42Days"]]) {
      if (day < windowCutoffDay(nowMs, days)) continue;
      result[mentionField] += counts.mentions || 0;
      result[`media${suffix}`] += counts.media || 0;
      result[`handwritten${suffix}`] += counts.handwritten || 0;
    }
  }
  return result;
}

/** Merge compact delta counts without changing reconciliation-owned identities. */
export function applyDeltaToCache(cache, aggregate, now = new Date()) {
  const currentState = cache.aggregationState;
  if (currentState?.version !== AGGREGATION_STATE_VERSION) throw new Error(`stats cache ${cache.classroomId} requires reconciliation`);
  const nextState = {version: AGGREGATION_STATE_VERSION, teacherRecent: {...currentState.teacherRecent}, studentRecent: {...currentState.studentRecent}};
  const next = {...cache, effortCounts: addCounts(cache.effortCounts, aggregate?.effortCounts || emptyCounts())};
  next.effortActivity = mergeActivity(cache.effortActivity, aggregate?.effortActivity, now);
  next.effortActivityByType = {};
  for (const type of ["voice", "text", "lesson", "media"]) next.effortActivityByType[type] = mergeActivity(cache.effortActivityByType?.[type], aggregate?.effortActivityByType?.[type], now);
  const nowMs = now.getTime();
  const currentDay = Math.floor(nowMs / DAY_MS);
  const teacherIds = new Set([...Object.keys(currentState.teacherRecent || {}), ...Object.keys(aggregate?.teacherRecent || {})]);
  for (const id of teacherIds) nextState.teacherRecent[id] = mergeRecent(currentState.teacherRecent?.[id], aggregate?.teacherRecent?.[id], windowCutoffDay(nowMs, 30), currentDay, emptyTeacherDayCounts);
  const studentIds = new Set([...Object.keys(currentState.studentRecent || {}), ...Object.keys(aggregate?.studentRecent || {})]);
  for (const id of studentIds) nextState.studentRecent[id] = mergeRecent(currentState.studentRecent?.[id], aggregate?.studentRecent?.[id], windowCutoffDay(nowMs, 42), currentDay, emptyStudentDayCounts);
  next.teachers = (cache.teachers || []).map((teacher) => ({...teacher, ...addCounts(teacher, aggregate?.teacherTotals?.[teacher.id] || emptyTeacherCounts()), ...teacherWindows(nextState.teacherRecent[teacher.id], nowMs)}));
  next.students = (cache.students || []).map((student) => ({...student, ...addCounts(student, aggregate?.studentTotals?.[student.id] || emptyStudentCounts()), ...studentWindows(nextState.studentRecent[student.id], nowMs)}));
  next.aggregationState = nextState;
  return next;
}

/** Recompute distinct cross-classroom values from compact rolling state. */
export function reconcileCrossClassroomCounts(caches, now = new Date()) {
  const nowMs = now.getTime();
  const activity = new Map();
  for (const cache of caches) {
    for (const [teacherId, events] of Object.entries(cache.aggregationState?.teacherRecent || {})) {
      const windows = teacherWindows(events, nowMs);
      if (!activity.has(teacherId)) activity.set(teacherId, new Map());
      activity.get(teacherId).set(cache.classroomId, {notes7d: windows.observations7d + windows.lessons7d + windows.media7d, notes30d: windows.observations30d + windows.lessons30d + windows.media30d});
    }
  }
  return caches.map((cache) => ({...cache, teachers: (cache.teachers || []).map((teacher) => {
    const others = [...(activity.get(teacher.id) || new Map()).entries()].filter(([classroomId]) => classroomId !== cache.classroomId).map(([, counts]) => counts);
    return {...teacher, otherNotes7d: others.reduce((sum, item) => sum + item.notes7d, 0), otherCount7d: others.filter((item) => item.notes7d > 0).length, otherNotes30d: others.reduce((sum, item) => sum + item.notes30d, 0), otherCount30d: others.filter((item) => item.notes30d > 0).length};
  })}));
}

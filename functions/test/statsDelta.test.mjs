import assert from "node:assert/strict";
import test from "node:test";
import {
  AGGREGATION_STATE_VERSION,
  DEFAULT_DELTA_PAGE_SIZE,
  addObservationToDelta,
  applyDeltaToCache,
  compareCursors,
  createDeltaAccumulator,
  cursorFromObservation,
  finalizeDelta,
  reconcileCrossClassroomCounts,
} from "../stats/delta.js";
import {aggregateObservationPage} from "../stats/reconcile.js";

const ts = (seconds, nanoseconds = 0) => ({seconds, nanoseconds});
const path = (student, id) => `students/${student}/observations/${id}`;
const dayKey = (atMs) => String(Math.floor(atMs / (24 * 60 * 60 * 1000)));
const observation = (id, overrides = {}) => ({
  id, path: path(overrides.studentId || "s1", id), classroomId: "c1",
  studentId: "s1", createdBy: "t1", type: "text", status: "ready",
  createdAt: ts(100), observedAt: new Date("2026-08-20T10:00:00Z"),
  ...overrides,
});

test("uses 1,000-document pages and exact timestamp/path cursors", () => {
  assert.equal(DEFAULT_DELTA_PAGE_SIZE, 1000);
  const early = {createdAt: ts(100, 123), documentPath: path("a", "z")};
  const laterNano = {createdAt: ts(100, 124), documentPath: path("a", "a")};
  const laterPath = {createdAt: ts(100, 123), documentPath: path("b", "a")};
  assert.equal(compareCursors(early, laterNano), -1);
  assert.equal(compareCursors(early, laterPath), -1);
  const createdAt = ts(1234, 567890123);
  assert.deepEqual(cursorFromObservation({ref: {path: path("s1", "o1")}, data: () => ({createdAt})}), {
    createdAt, documentPath: path("s1", "o1"),
  });
});

test("cross-run group canonicalization preserves raw student fan-out", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const first = observation("a", {groupId: "g1", studentId: "s1"});
  const second = observation("b", {groupId: "g1", studentId: "s2", path: path("s2", "b")});
  const canonical = new Map([["c1\u0000g1", cursorFromObservation(first)]]);
  const state = createDeltaAccumulator(now);
  aggregateObservationPage(state, [second], canonical);
  const classroom = finalizeDelta(state).classrooms.get("c1");
  assert.equal(classroom.actionCount, 0);
  assert.equal(classroom.mentionCount, 1);
  assert.equal(classroom.studentTotals.s2.totalMentions, 1);
});

test("pending media is a hard cursor barrier", () => {
  const state = createDeltaAccumulator(new Date("2026-08-22T12:00:00Z"));
  const before = observation("a", {createdAt: ts(100)});
  const pending = observation("b", {type: "media", status: "pending_upload", createdAt: ts(101)});
  const after = observation("c", {createdAt: ts(102)});
  const result = aggregateObservationPage(state, [before, pending, after]);
  assert.equal(result.blocked, true);
  assert.deepEqual(state.latestCursor, cursorFromObservation(before));
  assert.equal(finalizeDelta(state).classrooms.get("c1").actionCount, 1);
});

function baseCache(classroomId, teacherId, studentId, recent = {}) {
  return {
    classroomId, classroomName: classroomId, branchId: "b", studentCount: 1,
    effortCounts: {voice: 0, text: 0, lesson: 0, media: 0, total: 0},
    effortActivity: {}, effortActivityByType: {},
    teachers: [{id: teacherId, name: teacherId, email: "", status: "active", observations: 0, lessons: 0, media: 0, handwritten: 0}],
    students: [{id: studentId, name: studentId, status: "active", totalMentions: 0, mediaMentions: 0, handwrittenMentions: 0}],
    aggregationState: {version: AGGREGATION_STATE_VERSION, teacherRecent: recent.teacherRecent || {}, studentRecent: recent.studentRecent || {}},
  };
}

test("all numeric fields update and rolling windows expire exactly", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const state = createDeltaAccumulator(now);
  addObservationToDelta(state, observation("v", {type: "voice", observedAt: new Date("2026-08-21T12:00:00Z")}));
  addObservationToDelta(state, observation("m", {type: "media", handwritten: true, observedAt: new Date("2026-08-20T12:00:00Z"), status: "ready"}));
  const aggregate = finalizeDelta(state).classrooms.get("c1");
  const expiredDay = dayKey(new Date("2026-07-01T00:00:00Z").getTime());
  const cache = baseCache("c1", "t1", "s1", {
    teacherRecent: {t1: {[expiredDay]: {observations: 9, lessons: 0, media: 0, handwritten: 0}}},
    studentRecent: {s1: {[expiredDay]: {mentions: 9, media: 0, handwritten: 0}}},
  });
  const next = applyDeltaToCache(cache, aggregate, now);
  assert.deepEqual(next.effortCounts, {voice: 1, text: 0, lesson: 0, media: 1, total: 2});
  assert.equal(next.teachers[0].observations, 1);
  assert.equal(next.teachers[0].media, 1);
  assert.equal(next.teachers[0].handwritten, 1);
  assert.equal(next.teachers[0].observations7d, 1);
  assert.equal(next.teachers[0].media30d, 1);
  assert.equal(next.students[0].totalMentions, 2);
  assert.equal(next.students[0].mediaMentions, 1);
  assert.equal(next.students[0].last42DaysMentions, 2);
  assert.equal(expiredDay in next.aggregationState.teacherRecent.t1, false);
});

test("cross-classroom counts use distinct classrooms and age with rolling state", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const atMs = new Date("2026-08-21T12:00:00Z").getTime();
  const caches = ["c1", "c2", "c3"].map((classroomId) => baseCache(classroomId, "t1", `s-${classroomId}`, {
    teacherRecent: {t1: {[dayKey(atMs)]: {observations: classroomId === "c2" ? 2 : 1, lessons: 0, media: 0, handwritten: 0}}},
  }));
  const result = reconcileCrossClassroomCounts(caches, now);
  assert.equal(result[0].teachers[0].otherNotes7d, 3);
  assert.equal(result[0].teachers[0].otherCount7d, 2);
});

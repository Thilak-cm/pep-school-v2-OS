import assert from "node:assert/strict";
import test from "node:test";
import {addObservationToDelta, createDeltaAccumulator, finalizeDelta} from "../stats/delta.js";
import {
  FIRESTORE_RETRY_ATTEMPTS,
  aggregateObservationPage,
  buildClassroomCache,
  collectClassroomAggregate,
  findEarliestPendingMedia,
  isTransientFirestoreError,
  resolveCanonicalGroupCursors,
  withFirestoreRetry,
} from "../stats/reconcile.js";

test("retries only transient Firestore failures three times", async () => {
  let attempts = 0;
  const result = await withFirestoreRetry(async () => {
    attempts++;
    if (attempts < FIRESTORE_RETRY_ATTEMPTS) throw {code: "unavailable"};
    return "ok";
  }, FIRESTORE_RETRY_ATTEMPTS, async () => {});
  assert.equal(result, "ok");
  assert.equal(attempts, FIRESTORE_RETRY_ATTEMPTS);
  assert.equal(isTransientFirestoreError({code: "permission-denied"}), false);
  attempts = 0;
  await assert.rejects(withFirestoreRetry(async () => {
    attempts++;
    throw {code: "permission-denied"};
  }, 3, async () => {}));
  assert.equal(attempts, 1);
});

test("reconciliation releases each 1,000-document page before fetching the next", async () => {
  const makeDoc = (index) => ({
    id: `o${index}`,
    ref: {path: `students/s${index}/observations/o${index}`},
    data: () => ({classroomId: "c1", studentId: `s${index}`, createdBy: "t1", type: "text", createdAt: {seconds: 100 + index, nanoseconds: index}, observedAt: new Date("2026-08-20T00:00:00Z")}),
  });
  const pages = [Array.from({length: 1000}, (_, index) => makeDoc(index)), [makeDoc(1000)]];
  const starts = [];
  const database = {collectionGroup() {
    const query = {
      where() { return query; }, orderBy() { return query; }, limit() { return query; },
      startAfter(...values) { starts.push(values); return query; },
      async get() { return {docs: pages.shift()}; },
    };
    return query;
  }};
  const released = [];
  const delta = await collectClassroomAggregate("c1", {database, now: new Date("2026-08-22T00:00:00Z"), onPageReleased: (size) => released.push(size)});
  assert.deepEqual(released, [1000, 1]);
  assert.equal(starts.length, 1);
  assert.equal(delta.classrooms.get("c1").actionCount, 1001);
});

test("reconciliation pending barrier catches unexpected statuses across pages", async () => {
  const makeDoc = (index, status = "ready") => ({
    id: `m${index}`,
    ref: {path: `students/s${index}/observations/m${index}`},
    data: () => ({
      classroomId: "c1", type: "media", status,
      createdAt: {seconds: 100 + index, nanoseconds: index},
    }),
  });
  const pages = [
    Array.from({length: 1000}, (_, index) => makeDoc(index)),
    [makeDoc(1000, "uploaded"), makeDoc(1001, "failed")],
  ];
  const starts = [];
  const whereCalls = [];
  const database = {collectionGroup() {
    const query = {
      where(...values) { whereCalls.push(values); return query; },
      orderBy() { return query; }, limit() { return query; },
      startAfter(...values) { starts.push(values); return query; },
      async get() { return {docs: pages.shift()}; },
    };
    return query;
  }};
  const released = [];
  const cursor = await findEarliestPendingMedia(database, {
    onPageReleased: (size) => released.push(size),
  });
  assert.deepEqual(whereCalls, [["type", "==", "media"], ["type", "==", "media"]]);
  assert.deepEqual(released, [1000, 2]);
  assert.equal(starts.length, 1);
  assert.deepEqual(cursor, {
    createdAt: {seconds: 1100, nanoseconds: 1000},
    documentPath: "students/s1000/observations/m1000",
  });
});

test("canonical grouped sibling selection ignores earlier failed media", async () => {
  const observations = [
    {
      id: "failed", path: "students/s1/observations/failed", classroomId: "c1",
      studentId: "s1", createdBy: "t1", groupId: "g1", type: "media",
      status: "failed", createdAt: {seconds: 100, nanoseconds: 0},
      observedAt: new Date("2026-08-20T00:00:00Z"),
    },
    {
      id: "ready", path: "students/s2/observations/ready", classroomId: "c1",
      studentId: "s2", createdBy: "t1", groupId: "g1", type: "media",
      status: "ready", createdAt: {seconds: 101, nanoseconds: 0},
      observedAt: new Date("2026-08-20T00:00:00Z"),
    },
  ];
  const database = {collectionGroup() {
    const query = {
      where() { return query; },
      async get() { return {docs: observations}; },
    };
    return query;
  }};
  const canonical = await resolveCanonicalGroupCursors(observations, database);
  const state = createDeltaAccumulator(new Date("2026-08-22T00:00:00Z"));
  aggregateObservationPage(state, observations, canonical);
  const aggregate = finalizeDelta(state).classrooms.get("c1");

  assert.deepEqual([...canonical.values()], [{
    createdAt: observations[1].createdAt,
    documentPath: observations[1].path,
  }]);
  assert.equal(aggregate.actionCount, 1);
  assert.equal(aggregate.mentionCount, 1);
});

test("reconciliation owns roster identity while preserving fan-out counts", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const classroom = {id: "c1", name: "Primary", teacherIds: ["t1"]};
  const students = [{id: "s1", displayName: "A"}, {id: "s2", displayName: "B"}];
  const users = new Map([["t1", {displayName: "Teacher", email: "teacher@pep.school", role: "teacher"}]]);
  const state = createDeltaAccumulator(now);
  addObservationToDelta(state, {classroomId: "c1", studentId: "s1", createdBy: "t1", type: "text", observedAt: now}, {countAction: true});
  addObservationToDelta(state, {classroomId: "c1", studentId: "s2", createdBy: "t1", type: "text", observedAt: now}, {countAction: false});
  const aggregate = finalizeDelta(state).classrooms.get("c1");
  const cache = buildClassroomCache(classroom, students, users, aggregate, now);
  assert.equal(cache.classroomName, "Primary");
  assert.equal(cache.teachers[0].name, "Teacher");
  assert.equal(cache.effortCounts.total, 1);
  assert.equal(cache.teachers[0].observations, 1);
  assert.deepEqual(cache.students.map((student) => student.totalMentions), [1, 1]);
});

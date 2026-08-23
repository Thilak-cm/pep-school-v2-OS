import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DELTA_PAGE_SIZE,
  compareCursors,
  cursorFromObservation,
  createDeltaAccumulator,
  addObservationToDelta,
  finalizeDelta,
  mergeStatsDelta,
} from "../stats/delta.js";

test("uses a 1,000-document delta page size", () => {
  assert.equal(DEFAULT_DELTA_PAGE_SIZE, 1000);
});

test("orders cursors by createdAt and document path", () => {
  const earlier = {createdAtMs: 100, documentPath: "students/a/observations/z"};
  const sameTimeLaterPath = {createdAtMs: 100, documentPath: "students/b/observations/a"};
  const later = {createdAtMs: 101, documentPath: "students/a/observations/a"};

  assert.equal(compareCursors(earlier, sameTimeLaterPath), -1);
  assert.equal(compareCursors(sameTimeLaterPath, earlier), 1);
  assert.equal(compareCursors(sameTimeLaterPath, later), -1);
});

test("builds a persistent cursor from a Firestore-like observation", () => {
  const cursor = cursorFromObservation({
    ref: {path: "students/s1/observations/o1"},
    data: () => ({createdAt: {toMillis: () => 1234}}),
  });

  assert.deepEqual(cursor, {
    createdAtMs: 1234,
    documentPath: "students/s1/observations/o1",
  });
});

test("deduplicates grouped effort actions across pages but preserves student mentions", () => {
  const state = createDeltaAccumulator();
  const firstPage = [
    {id: "a", path: "students/s1/observations/a", groupId: "g1", studentId: "s1", classroomId: "c1", createdBy: "t1", type: "voice", observedAt: new Date("2026-08-20T10:00:00Z")},
    {id: "b", path: "students/s2/observations/b", groupId: "g1", studentId: "s2", classroomId: "c1", createdBy: "t1", type: "voice", observedAt: new Date("2026-08-20T10:00:00Z")},
  ];
  const secondPage = [
    {id: "c", path: "students/s3/observations/c", groupId: "g2", studentId: "s3", classroomId: "c1", createdBy: "t1", type: "text", observedAt: new Date("2026-08-20T11:00:00Z")},
  ];

  firstPage.forEach((observation) => addObservationToDelta(state, observation));
  secondPage.forEach((observation) => addObservationToDelta(state, observation));

  const delta = finalizeDelta(state, new Date("2026-08-22T12:00:00Z"));
  assert.equal(delta.effortCounts.total, 2);
  assert.equal(delta.effortCounts.voice, 1);
  assert.equal(delta.effortCounts.text, 1);
  assert.equal(delta.studentMentions.length, 3);
});

test("merges a delta without mutating unrelated cache fields", () => {
  const cache = {
    classroomId: "c1",
    classroomName: "Classroom",
    studentCount: 4,
    effortCounts: {voice: 2, text: 1, lesson: 0, media: 0, total: 3},
  };
  const merged = mergeStatsDelta(cache, {
    effortCounts: {voice: 1, text: 0, lesson: 0, media: 0, total: 1},
  });

  assert.equal(merged.effortCounts.voice, 3);
  assert.equal(merged.effortCounts.total, 4);
  assert.equal(merged.studentCount, 4);
  assert.equal(merged.classroomName, "Classroom");
  assert.equal(cache.effortCounts.voice, 2);
});

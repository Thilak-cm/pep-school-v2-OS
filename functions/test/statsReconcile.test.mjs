import assert from "node:assert/strict";
import test from "node:test";

import {
  RECONCILE_RETRY_ATTEMPTS,
  buildClassroomCache,
  withFirestoreRetry,
} from "../stats/reconcile.js";

test("reconciliation retries transient reads three times", async () => {
  let attempts = 0;
  const result = await withFirestoreRetry(async () => {
    attempts++;
    if (attempts < RECONCILE_RETRY_ATTEMPTS) throw new Error("transient");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(attempts, RECONCILE_RETRY_ATTEMPTS);
});

test("reconciliation compacts one classroom while preserving student fan-out", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const classroom = {id: "c1", name: "Primary", teacherIds: ["t1"]};
  const students = [
    {id: "s1", displayName: "A", status: "active"},
    {id: "s2", displayName: "B", status: "active"},
  ];
  const users = new Map([["t1", {id: "t1", displayName: "Teacher", role: "teacher"}]]);
  const observations = [
    {id: "o1", path: "students/s1/observations/o1", classroomId: "c1", studentId: "s1", createdBy: "t1", groupId: "g1", type: "text", observedAt: now, createdAt: now},
    {id: "o2", path: "students/s2/observations/o2", classroomId: "c1", studentId: "s2", createdBy: "t1", groupId: "g1", type: "text", observedAt: now, createdAt: now},
  ];
  const cache = buildClassroomCache(classroom, students, users, observations, now);
  assert.equal(cache.effortCounts.total, 1);
  assert.equal(cache.teachers[0].observations, 1);
  assert.equal(cache.students[0].totalMentions, 1);
  assert.equal(cache.students[1].totalMentions, 1);
});

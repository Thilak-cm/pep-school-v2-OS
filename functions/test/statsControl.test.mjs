import assert from "node:assert/strict";
import test from "node:test";

import {
  LEASE_DURATION_MS,
  LEASE_RENEW_INTERVAL_MS,
  isLeaseExpired,
  canPublishRun,
  buildDeltaMeta,
  leaseAcquisitionDecision,
} from "../stats/control.js";

test("uses a renewable 60-second lease", () => {
  assert.equal(LEASE_DURATION_MS, 60 * 1000);
  assert.ok(LEASE_RENEW_INTERVAL_MS < LEASE_DURATION_MS);
});

test("recognizes an expired lease", () => {
  assert.equal(isLeaseExpired({deltaLeaseUntilMs: 1000}, 1001), true);
  assert.equal(isLeaseExpired({deltaLeaseUntilMs: 1000}, 999), false);
  assert.equal(isLeaseExpired({}, 1001), true);
});

test("generation and opaque run id both fence publishers", () => {
  assert.equal(canPublishRun({deltaGeneration: 8, deltaRunId: "new"}, 8, "new"), true);
  assert.equal(canPublishRun({deltaGeneration: 8, deltaRunId: "new"}, 8, "old"), false);
  assert.equal(canPublishRun({deltaGeneration: 8}, 7), false);
  assert.equal(canPublishRun({}, 1), false);
});

test("a missing checkpoint never grants the delta lease", () => {
  assert.equal(leaseAcquisitionDecision(null, {exists: false}), "missing-checkpoint");
  assert.equal(leaseAcquisitionDecision({deltaCursor: null, deltaLeaseUntilMs: null}), "missing-checkpoint");
  assert.equal(leaseAcquisitionDecision({deltaCursor: null, deltaLeaseUntilMs: 2000}, {nowMs: 1000}), "wait");
  assert.equal(leaseAcquisitionDecision(null, {exists: false, allowBootstrap: true}), "acquire");
});

test("builds checkpoint metadata without changing existing freshness fields", () => {
  const meta = buildDeltaMeta({
    base: {cachedAt: "old", classroomCount: 3},
    cursor: {createdAt: {seconds: 1, nanoseconds: 234000000}, documentPath: "students/s/observations/o"},
    generation: 9,
    runId: "run-9",
  });

  assert.deepEqual(meta, {
    cachedAt: "old",
    classroomCount: 3,
    deltaCursor: {
      createdAt: {seconds: 1, nanoseconds: 234000000},
      documentPath: "students/s/observations/o",
    },
    deltaGeneration: 9,
    deltaRunId: "run-9",
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
  });
});

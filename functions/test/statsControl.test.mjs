import assert from "node:assert/strict";
import test from "node:test";

import {
  LEASE_DURATION_MS,
  isLeaseExpired,
  canPublishRun,
  buildDeltaMeta,
} from "../stats/control.js";

test("uses a renewable 60-second lease", () => {
  assert.equal(LEASE_DURATION_MS, 60 * 1000);
});

test("recognizes an expired lease", () => {
  assert.equal(isLeaseExpired({deltaLeaseUntilMs: 1000}, 1001), true);
  assert.equal(isLeaseExpired({deltaLeaseUntilMs: 1000}, 999), false);
  assert.equal(isLeaseExpired({}, 1001), true);
});

test("only the current generation may publish", () => {
  assert.equal(canPublishRun({deltaGeneration: 8}, 8), true);
  assert.equal(canPublishRun({deltaGeneration: 8}, 7), false);
  assert.equal(canPublishRun({}, 1), false);
});

test("builds checkpoint metadata without changing existing freshness fields", () => {
  const meta = buildDeltaMeta({
    base: {cachedAt: "old", classroomCount: 3},
    cursor: {createdAtMs: 1234, documentPath: "students/s/observations/o"},
    generation: 9,
    runId: "run-9",
    nowMs: 5000,
  });

  assert.deepEqual(meta, {
    cachedAt: "old",
    classroomCount: 3,
    deltaCursor: {
      createdAtMs: 1234,
      documentPath: "students/s/observations/o",
    },
    deltaGeneration: 9,
    deltaRunId: "run-9",
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
    deltaUpdatedAtMs: 5000,
  });
});

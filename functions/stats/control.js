/**
 * Pure control-record helpers for stats delta/reconciliation runs.
 * The control record lives at statsCache/_meta; Firestore-specific lease
 * acquisition remains in the entrypoint so these invariants stay testable.
 */

export const LEASE_DURATION_MS = 60 * 1000;

export function isLeaseExpired(meta = {}, nowMs = Date.now()) {
  return !meta.deltaLeaseUntilMs || meta.deltaLeaseUntilMs <= nowMs;
}

export function canPublishRun(meta = {}, generation) {
  return Number.isInteger(generation) && meta.deltaGeneration === generation;
}

export function buildDeltaMeta({base = {}, cursor, generation, runId, nowMs}) {
  return {
    ...base,
    deltaCursor: cursor,
    deltaGeneration: generation,
    deltaRunId: runId,
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
    deltaUpdatedAtMs: nowMs,
  };
}

export function buildLeaseMeta({base = {}, generation, runId, leaseUntilMs}) {
  return {
    ...base,
    deltaGeneration: generation,
    deltaRunId: runId,
    deltaRunStatus: "running",
    deltaLeaseUntilMs: leaseUntilMs,
  };
}

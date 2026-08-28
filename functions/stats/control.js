/**
 * Pure control-record helpers for stats delta/reconciliation runs.
 * The control record lives at statsCache/_meta; Firestore-specific lease
 * acquisition remains in the entrypoint so these invariants stay testable.
 */

export const LEASE_DURATION_MS = 60 * 1000;
export const LEASE_RENEW_INTERVAL_MS = 20 * 1000;

export function isLeaseExpired(meta = {}, nowMs = Date.now()) {
  return !meta.deltaLeaseUntilMs || meta.deltaLeaseUntilMs <= nowMs;
}

export function leaseAcquisitionDecision(meta, {exists = true, allowBootstrap = false, nowMs = Date.now()} = {}) {
  if (!exists) return allowBootstrap ? "acquire" : "missing-checkpoint";
  if (!meta?.deltaCursor && !allowBootstrap) {
    return isLeaseExpired(meta, nowMs) ? "missing-checkpoint" : "wait";
  }
  return isLeaseExpired(meta, nowMs) ? "acquire" : "wait";
}

export function canPublishRun(meta = {}, generation, runId) {
  return Number.isInteger(generation) && meta.deltaGeneration === generation &&
    (!runId || meta.deltaRunId === runId);
}

export function buildDeltaMeta({base = {}, cursor, generation, runId}) {
  return {
    ...base,
    deltaCursor: cursor,
    deltaGeneration: generation,
    deltaRunId: runId,
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
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

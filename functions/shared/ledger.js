/**
 * Durable execution ledger for scheduled jobs (#229).
 *
 * Schema: jobs/{jobKey}/executions/{executionId}/workItems/{workItemId}
 *
 * Pure-logic helpers are Firebase-free for testability.
 * Firestore operations import db from shared/firebase.js.
 */

import { randomUUID } from "node:crypto";
import { db, Timestamp } from "./firebase.js";
import { getIstIsoWeekKey } from "../utils/weekKey.js";
import {
  getCurrentMonthIST,
  getNextMonthIST,
  getRunMonthIST,
} from "../utils/periodKeys.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXECUTION_TTL_MONTHS = 13;
const WORK_ITEM_TTL_DAYS = 90;
const MAX_BATCH_SIZE = 500;

/**
 * Machine-readable failure categories (reference only):
 * provider_quota, provider_error, generation_error, data_missing,
 * write_failed, export_failed, unverified, never_started, unknown.
 *
 * Not exported - classifyError() returns these as string literals.
 */

// ---------------------------------------------------------------------------
// Period-key dispatch (pure)
// ---------------------------------------------------------------------------

/**
 * Map of jobKey -> period-key function.
 * Each returns the executionId for the current run period.
 */
const PERIOD_KEY_FNS = {
  cleanupDeletedChats: getRunMonthIST,
  baseballCards: getIstIsoWeekKey,
  writingAnalysis: getIstIsoWeekKey,
  digestClassroomAdmin: getIstIsoWeekKey,
  digestSuperadmin: getIstIsoWeekKey,
  soulRegen: getCurrentMonthIST,
  monthlyPlans: getNextMonthIST,
};

/**
 * Compute the deterministic executionId for a job.
 * @param {string} jobKey
 * @param {Date} [now]
 * @returns {string} e.g. "2026-09", "2026-W35"
 */
export function computeExecutionId(jobKey, now = new Date()) {
  const fn = PERIOD_KEY_FNS[jobKey];
  if (!fn) throw new Error(`Unknown jobKey: ${jobKey}`);
  return fn(now);
}

// ---------------------------------------------------------------------------
// TTL computation (pure)
// ---------------------------------------------------------------------------

/**
 * Compute expiresAt for execution docs (13 months) or workItem docs (90 days).
 * @param {"execution"|"workItem"} type
 * @param {Date} [from]
 * @returns {Date}
 */
export function computeExpiresAt(type, from = new Date()) {
  const d = new Date(from);
  if (type === "execution") {
    d.setMonth(d.getMonth() + EXECUTION_TTL_MONTHS);
  } else if (type === "workItem") {
    d.setDate(d.getDate() + WORK_ITEM_TTL_DAYS);
  } else {
    throw new Error(`Unknown TTL type: ${type}`);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Error classification (pure)
// ---------------------------------------------------------------------------

const QUOTA_PATTERNS = [
  "rate_limit",
  "rate limit",
  "quota",
  "insufficient_quota",
  "billing",
  "credits",
  "429",
];

/**
 * Classify an error into a failure category.
 * @param {Error|{code?:string, message?:string, status?:number}} err
 * @returns {string} One of: provider_quota, provider_error, generation_error, data_missing, write_failed, export_failed, unverified, never_started, unknown
 */
export function classifyError(err) {
  if (!err) return "unknown";

  const code = String(err.code || "").toLowerCase();
  const message = String(err.message || "").toLowerCase();
  const status = err.status || err.statusCode;

  // Provider quota / rate limit
  if (QUOTA_PATTERNS.some((p) => code.includes(p) || message.includes(p))) {
    return "provider_quota";
  }
  if (status === 429) return "provider_quota";

  // Data missing
  if (code === "not-found" || code === "not_found") return "data_missing";
  if (code === "failed-precondition" || code === "failed_precondition") return "data_missing";

  // Provider error (upstream 5xx)
  if (status >= 500 && status < 600) return "provider_error";
  if (message.includes("timeout") || message.includes("econnrefused")) return "provider_error";

  // Write failures
  if (message.includes("firestore") && message.includes("write")) return "write_failed";
  if (code === "deadline-exceeded") return "write_failed";

  // Drive export failures
  if (message.includes("drive") && (message.includes("export") || message.includes("folder"))) {
    return "export_failed";
  }

  // Generation errors (LLM output parsing)
  if (message.includes("parse") || message.includes("json") || message.includes("schema")) {
    return "generation_error";
  }

  return "unknown";
}

/**
 * Compute the most frequent failure category from a list of workItems.
 * @param {Array<{failureCategory?:string}>} workItems
 * @returns {string|null} dominant category, or null if no failures
 */
export function computeDominantCategory(workItems) {
  const counts = {};
  for (const item of workItems) {
    const cat = item.failureCategory;
    if (cat && cat !== "unknown") {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  // Fall back to "unknown" if all failures are unknown
  if (Object.keys(counts).length === 0) {
    const hasAnyFailure = workItems.some((i) => i.failureCategory);
    return hasAnyFailure ? "unknown" : null;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Doc builders (pure)
// ---------------------------------------------------------------------------

/**
 * Build the data payload for an execution doc.
 * @param {string} jobKey
 * @param {string} executionId
 * @param {number} expectedCount
 * @param {Date} [now]
 * @returns {object}
 */
export function buildExecutionDoc(jobKey, executionId, expectedCount, now = new Date()) {
  return {
    jobKey,
    executionId,
    correlationId: randomUUID(),
    state: "running",
    startedAt: now,
    finalizedAt: null,
    expectedCount,
    completedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    missingCount: 0,
    dominantFailureCategory: null,
    monitoringDelivery: null,
    expiresAt: computeExpiresAt("execution", now),
  };
}

/**
 * Build a pending workItem doc for seeding.
 * @param {string} targetId
 * @param {Date} [now]
 * @returns {object}
 */
export function buildPendingWorkItem(targetId, now = new Date()) {
  return {
    targetId,
    state: "pending",
    startedAt: null,
    completedAt: null,
    failureCategory: null,
    detail: null,
    evidence: null,
    expiresAt: computeExpiresAt("workItem", now),
  };
}

/**
 * Build a workItem update for a completed/failed/skipped unit.
 * @param {"success"|"skipped"|"failed"} state
 * @param {object} [opts]
 * @param {string} [opts.failureCategory]
 * @param {string} [opts.detail] - sanitized, no PII
 * @param {object} [opts.evidence] - verification evidence
 * @param {Date} [opts.now]
 * @returns {object}
 */
export function buildWorkItemUpdate(state, opts = {}) {
  const now = opts.now || new Date();
  return {
    state,
    completedAt: now,
    ...(state === "failed" && {
      failureCategory: opts.failureCategory || "unknown",
      detail: (opts.detail || "").slice(0, 500),
    }),
    ...(state === "skipped" && {
      detail: (opts.detail || "").slice(0, 500),
    }),
    ...(opts.evidence && { evidence: opts.evidence }),
  };
}

// ---------------------------------------------------------------------------
// Batch chunking (pure)
// ---------------------------------------------------------------------------

/**
 * Chunk an array into sub-arrays of at most `size` elements.
 * @param {Array} items
 * @param {number} size
 * @returns {Array<Array>}
 */
export function chunk(items, size = MAX_BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Firestore operations
// ---------------------------------------------------------------------------

function executionRef(jobKey, executionId) {
  return db.collection("jobs").doc(jobKey)
    .collection("executions").doc(executionId);
}

function workItemRef(jobKey, executionId, targetId) {
  return executionRef(jobKey, executionId)
    .collection("workItems").doc(targetId);
}

/**
 * Create the execution doc. Ensures the root jobs/{jobKey} doc exists.
 */
export async function createExecution(jobKey, executionId, expectedCount, now = new Date()) {
  const doc = buildExecutionDoc(jobKey, executionId, expectedCount, now);
  const batch = db.batch();
  batch.set(db.collection("jobs").doc(jobKey), { jobKey, lastExecutionId: executionId }, { merge: true });
  batch.set(executionRef(jobKey, executionId), {
    ...doc,
    startedAt: Timestamp.fromDate(doc.startedAt),
    expiresAt: Timestamp.fromDate(doc.expiresAt),
  });
  await batch.commit();
  return doc;
}

/**
 * Seed pending workItems in parallel batched writes.
 * Each Firestore batch is <=500 writes. All batches run concurrently.
 * @returns {Promise<void>}
 */
export async function seedWorkItems(jobKey, executionId, targetIds, now = new Date()) {
  const batches = chunk(targetIds);
  await Promise.all(batches.map((group) => {
    const batch = db.batch();
    for (const targetId of group) {
      const item = buildPendingWorkItem(targetId, now);
      batch.set(workItemRef(jobKey, executionId, targetId), {
        ...item,
        expiresAt: Timestamp.fromDate(item.expiresAt),
      });
    }
    return batch.commit();
  }));
}

/**
 * Update a single workItem. Uses merge so worker writes are idempotent
 * and ordering with seed writes is irrelevant.
 */
export async function updateWorkItem(jobKey, executionId, targetId, update) {
  const data = { ...update };
  if (data.completedAt instanceof Date) {
    data.completedAt = Timestamp.fromDate(data.completedAt);
  }
  await workItemRef(jobKey, executionId, targetId).set(data, { merge: true });
}

/**
 * Write terminal state and aggregates onto the execution doc.
 */
export async function finalizeExecution(jobKey, executionId, aggregates) {
  const data = {
    ...aggregates,
    finalizedAt: Timestamp.now(),
  };
  await executionRef(jobKey, executionId).update(data);
}

/**
 * Read the execution doc for a given job + period.
 * @returns {object|null} doc data, or null if not found
 */
export async function getExecution(jobKey, executionId) {
  const snap = await executionRef(jobKey, executionId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Read all workItems for a given execution.
 * @returns {Array<{id:string, ...}>}
 */
export async function getWorkItems(jobKey, executionId) {
  const snap = await executionRef(jobKey, executionId).collection("workItems").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Mark execution as failed with crash-level failure.
 * Used by the failure-fast path (direct-loop job catches a fatal error).
 */
export async function markExecutionFailed(jobKey, executionId, error) {
  const category = classifyError(error);
  // set+merge so this works even if the execution doc was never created
  // (e.g., crash before createExecution ran).
  await executionRef(jobKey, executionId).set({
    state: "failed",
    finalizedAt: Timestamp.now(),
    dominantFailureCategory: category,
  }, {merge: true});
}

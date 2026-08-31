/**
 * Tests for execution ledger pure-logic helpers (#229).
 *
 * Run with: node --test functions/shared/ledger.test.mjs
 *
 * These test only Firebase-free functions. Firestore operations
 * are verified via integration/manual testing.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// We cannot import ledger.js directly (it imports firebase.js which calls
// initializeApp). Instead, we inline-copy the pure functions per the
// established pattern (see scheduling.test.mjs).
// ---------------------------------------------------------------------------

// --- computeExpiresAt ---
function computeExpiresAt(type, from = new Date()) {
  const d = new Date(from);
  if (type === "execution") {
    d.setMonth(d.getMonth() + 13);
  } else if (type === "workItem") {
    d.setDate(d.getDate() + 90);
  } else {
    throw new Error(`Unknown TTL type: ${type}`);
  }
  return d;
}

// --- classifyError ---
const QUOTA_PATTERNS = [
  "rate_limit", "rate limit", "quota", "insufficient_quota",
  "billing", "credits", "429",
];

function classifyError(err) {
  if (!err) return "unknown";
  const code = String(err.code || "").toLowerCase();
  const message = String(err.message || "").toLowerCase();
  const status = err.status || err.statusCode;

  if (QUOTA_PATTERNS.some((p) => code.includes(p) || message.includes(p))) return "provider_quota";
  if (status === 429) return "provider_quota";
  if (code === "not-found" || code === "not_found") return "data_missing";
  if (code === "failed-precondition" || code === "failed_precondition") return "data_missing";
  if (status >= 500 && status < 600) return "provider_error";
  if (message.includes("timeout") || message.includes("econnrefused")) return "provider_error";
  if (message.includes("firestore") && message.includes("write")) return "write_failed";
  if (code === "deadline-exceeded") return "write_failed";
  if (message.includes("drive") && (message.includes("export") || message.includes("folder"))) return "export_failed";
  if (message.includes("parse") || message.includes("json") || message.includes("schema")) return "generation_error";
  return "unknown";
}

// --- computeDominantCategory ---
function computeDominantCategory(workItems) {
  const counts = {};
  for (const item of workItems) {
    const cat = item.failureCategory;
    if (cat && cat !== "unknown") counts[cat] = (counts[cat] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) {
    return workItems.some((i) => i.failureCategory) ? "unknown" : null;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// --- buildWorkItemUpdate ---
function buildWorkItemUpdate(state, opts = {}) {
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

// --- chunk ---
function chunk(items, size = 500) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("computeExpiresAt", () => {
  test("execution: 13 months from reference", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const result = computeExpiresAt("execution", from);
    assert.equal(result.getFullYear(), 2027);
    assert.equal(result.getMonth(), 9); // October (0-indexed)
    assert.equal(result.getDate(), 1);
  });

  test("workItem: 90 days from reference", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const result = computeExpiresAt("workItem", from);
    const diffDays = Math.round((result - from) / (24 * 60 * 60 * 1000));
    assert.equal(diffDays, 90);
  });

  test("execution handles year rollover", () => {
    const from = new Date("2026-12-15T00:00:00Z");
    const result = computeExpiresAt("execution", from);
    assert.equal(result.getFullYear(), 2028);
    assert.equal(result.getMonth(), 0); // January
  });

  test("throws on unknown type", () => {
    assert.throws(() => computeExpiresAt("bogus"), /Unknown TTL type/);
  });
});

describe("classifyError", () => {
  test("null/undefined -> unknown", () => {
    assert.equal(classifyError(null), "unknown");
    assert.equal(classifyError(undefined), "unknown");
  });

  test("rate limit message -> provider_quota", () => {
    assert.equal(classifyError({ message: "Rate limit exceeded" }), "provider_quota");
  });

  test("429 status -> provider_quota", () => {
    assert.equal(classifyError({ status: 429, message: "too many requests" }), "provider_quota");
  });

  test("insufficient_quota code -> provider_quota", () => {
    assert.equal(classifyError({ code: "insufficient_quota" }), "provider_quota");
  });

  test("credits in message -> provider_quota", () => {
    assert.equal(classifyError({ message: "No credits remaining" }), "provider_quota");
  });

  test("not-found code -> data_missing", () => {
    assert.equal(classifyError({ code: "not-found" }), "data_missing");
  });

  test("failed-precondition code -> data_missing", () => {
    assert.equal(classifyError({ code: "failed-precondition" }), "data_missing");
  });

  test("500 status -> provider_error", () => {
    assert.equal(classifyError({ status: 500, message: "internal server error" }), "provider_error");
  });

  test("timeout message -> provider_error", () => {
    assert.equal(classifyError({ message: "Connection timeout" }), "provider_error");
  });

  test("Firestore write failure -> write_failed", () => {
    assert.equal(classifyError({ message: "Firestore write failed" }), "write_failed");
  });

  test("deadline-exceeded -> write_failed", () => {
    assert.equal(classifyError({ code: "deadline-exceeded" }), "write_failed");
  });

  test("Drive export error -> export_failed", () => {
    assert.equal(classifyError({ message: "Drive export timed out" }), "export_failed");
  });

  test("Drive folder error -> export_failed", () => {
    assert.equal(classifyError({ message: "Could not create Drive folder" }), "export_failed");
  });

  test("JSON parse error -> generation_error", () => {
    assert.equal(classifyError({ message: "Unexpected token in JSON" }), "generation_error");
  });

  test("schema validation error -> generation_error", () => {
    assert.equal(classifyError({ message: "Schema validation failed" }), "generation_error");
  });

  test("unknown error -> unknown", () => {
    assert.equal(classifyError({ message: "Something weird happened" }), "unknown");
  });
});

describe("computeDominantCategory", () => {
  test("returns most frequent category", () => {
    const items = [
      { failureCategory: "provider_quota" },
      { failureCategory: "provider_quota" },
      { failureCategory: "data_missing" },
    ];
    assert.equal(computeDominantCategory(items), "provider_quota");
  });

  test("returns null when no failures", () => {
    assert.equal(computeDominantCategory([]), null);
    assert.equal(computeDominantCategory([{ state: "success" }]), null);
  });

  test("returns unknown when all failures are unknown", () => {
    const items = [
      { failureCategory: "unknown" },
      { failureCategory: "unknown" },
    ];
    assert.equal(computeDominantCategory(items), "unknown");
  });

  test("ignores unknown when named categories exist", () => {
    const items = [
      { failureCategory: "unknown" },
      { failureCategory: "provider_error" },
    ];
    assert.equal(computeDominantCategory(items), "provider_error");
  });

  test("tie-breaks by first-seen order (stable sort)", () => {
    const items = [
      { failureCategory: "data_missing" },
      { failureCategory: "write_failed" },
    ];
    // Both have count 1; sort is stable so first in entries wins
    const result = computeDominantCategory(items);
    assert.ok(["data_missing", "write_failed"].includes(result));
  });
});

describe("buildWorkItemUpdate", () => {
  const now = new Date("2026-09-01T02:30:00Z");

  test("success state includes completedAt, no failure fields", () => {
    const result = buildWorkItemUpdate("success", { now });
    assert.equal(result.state, "success");
    assert.equal(result.completedAt, now);
    assert.equal(result.failureCategory, undefined);
    assert.equal(result.detail, undefined);
  });

  test("failed state includes failureCategory and detail", () => {
    const result = buildWorkItemUpdate("failed", {
      failureCategory: "provider_quota",
      detail: "credits exhausted",
      now,
    });
    assert.equal(result.state, "failed");
    assert.equal(result.failureCategory, "provider_quota");
    assert.equal(result.detail, "credits exhausted");
  });

  test("failed state defaults failureCategory to unknown", () => {
    const result = buildWorkItemUpdate("failed", { now });
    assert.equal(result.failureCategory, "unknown");
  });

  test("detail is truncated to 500 chars", () => {
    const longDetail = "x".repeat(600);
    const result = buildWorkItemUpdate("failed", { detail: longDetail, now });
    assert.equal(result.detail.length, 500);
  });

  test("skipped state includes detail but not failureCategory", () => {
    const result = buildWorkItemUpdate("skipped", { detail: "insufficient_samples", now });
    assert.equal(result.state, "skipped");
    assert.equal(result.detail, "insufficient_samples");
    assert.equal(result.failureCategory, undefined);
  });

  test("evidence is included when provided", () => {
    const evidence = { generatedAt: now, weekKey: "2026-W35" };
    const result = buildWorkItemUpdate("success", { evidence, now });
    assert.deepEqual(result.evidence, evidence);
  });
});

describe("chunk", () => {
  test("splits array into groups of specified size", () => {
    const items = [1, 2, 3, 4, 5];
    const result = chunk(items, 2);
    assert.deepEqual(result, [[1, 2], [3, 4], [5]]);
  });

  test("single chunk when items <= size", () => {
    assert.deepEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
  });

  test("empty array -> empty result", () => {
    assert.deepEqual(chunk([], 500), []);
  });

  test("default size is 500", () => {
    const items = Array.from({ length: 501 }, (_, i) => i);
    const result = chunk(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].length, 500);
    assert.equal(result[1].length, 1);
  });
});

/**
 * Tests for verifier engine aggregation logic (#229).
 *
 * Run with: node --test functions/verification/engine.test.mjs
 *
 * Tests the pure aggregation/terminal-state logic by inlining it.
 * The full runVerifier is tested via integration/manual testing.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Inline the core aggregation logic from engine.js
function computeAggregates(workItems, expectedCount) {
  const results = { completed: 0, skipped: 0, failed: 0, missing: 0, unverified: 0 };

  for (const item of workItems) {
    if (item.state === "success") results.completed++;
    else if (item.state === "skipped") results.skipped++;
    else if (item.state === "failed") results.failed++;
    else if (item.state === "pending") results.missing++;
  }

  const accountedFor = results.completed + results.skipped + results.failed + results.missing + results.unverified;
  if (accountedFor < expectedCount) {
    results.missing += (expectedCount - accountedFor);
  }

  return results;
}

function isExecutionSuccess(results, expectedCount) {
  return results.completed + results.skipped === expectedCount
    && results.failed === 0
    && results.missing === 0
    && results.unverified === 0;
}

describe("computeAggregates", () => {
  test("counts all states correctly", () => {
    const items = [
      { state: "success" },
      { state: "success" },
      { state: "skipped" },
      { state: "failed" },
      { state: "pending" },
    ];
    const r = computeAggregates(items, 5);
    assert.equal(r.completed, 2);
    assert.equal(r.skipped, 1);
    assert.equal(r.failed, 1);
    assert.equal(r.missing, 1);
  });

  test("adds missing count for unaccounted items", () => {
    const items = [{ state: "success" }];
    const r = computeAggregates(items, 5);
    assert.equal(r.completed, 1);
    assert.equal(r.missing, 4); // 5 expected, only 1 workItem doc
  });

  test("handles empty workItems with nonzero expected", () => {
    const r = computeAggregates([], 10);
    assert.equal(r.missing, 10);
  });
});

describe("isExecutionSuccess", () => {
  test("true when completed + skipped == expected, zero failures", () => {
    const r = { completed: 440, skipped: 10, failed: 0, missing: 0, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 450), true);
  });

  test("false when any failed", () => {
    const r = { completed: 449, skipped: 0, failed: 1, missing: 0, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 450), false);
  });

  test("false when any missing", () => {
    const r = { completed: 449, skipped: 0, failed: 0, missing: 1, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 450), false);
  });

  test("false when any unverified", () => {
    const r = { completed: 449, skipped: 0, failed: 0, missing: 0, unverified: 1 };
    assert.equal(isExecutionSuccess(r, 450), false);
  });

  test("false when completed + skipped < expected (shortfall)", () => {
    const r = { completed: 440, skipped: 5, failed: 0, missing: 0, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 450), false);
  });

  test("true for all-skipped run (all legitimately skipped)", () => {
    const r = { completed: 0, skipped: 450, failed: 0, missing: 0, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 450), true);
  });

  test("true for zero-expected (e.g. no active students)", () => {
    const r = { completed: 0, skipped: 0, failed: 0, missing: 0, unverified: 0 };
    assert.equal(isExecutionSuccess(r, 0), true);
  });
});

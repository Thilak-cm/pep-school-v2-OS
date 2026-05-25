/**
 * Tests for shared scheduling utilities (PEP-263).
 *
 * Run with: node --test functions/shared/scheduling.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

// We can't import the actual module (it depends on Firebase),
// so we test the logic inline. runWithConcurrency is pure logic.

async function runWithConcurrency(items, worker, limit = 10) {
  const queue = [...items];
  const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      try {
        await worker(next);
      } catch {
        // swallowed per design
      }
    }
  });
  await Promise.all(workers);
}

test("runWithConcurrency processes all items", async () => {
  const processed = [];
  await runWithConcurrency([1, 2, 3, 4, 5], async (item) => {
    processed.push(item);
  }, 2);
  assert.deepEqual(processed.sort(), [1, 2, 3, 4, 5]);
});

test("runWithConcurrency respects concurrency limit", async () => {
  let peak = 0;
  let current = 0;
  await runWithConcurrency([1, 2, 3, 4, 5, 6], async () => {
    current++;
    peak = Math.max(peak, current);
    await setTimeout(20);
    current--;
  }, 3);
  assert.ok(peak <= 3, `Peak concurrency was ${peak}, expected <= 3`);
});

test("runWithConcurrency swallows per-item errors", async () => {
  const processed = [];
  await runWithConcurrency([1, 2, 3], async (item) => {
    if (item === 2) throw new Error("fail");
    processed.push(item);
  }, 2);
  assert.deepEqual(processed.sort(), [1, 3]);
});

test("runWithConcurrency handles empty array", async () => {
  const processed = [];
  await runWithConcurrency([], async (item) => {
    processed.push(item);
  }, 5);
  assert.deepEqual(processed, []);
});

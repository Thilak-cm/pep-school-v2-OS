/**
 * Tests for verifier Telegram signal formatting (#229).
 *
 * Run with: node --test functions/shared/verifierTelegram.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatGreenSignal,
  formatRedSignal,
  formatMissedStartSignal,
  formatCrashSignal,
} from "./verifierTelegram.js";

describe("formatGreenSignal", () => {
  test("includes jobKey, executionId, counts, and duration", () => {
    const msg = formatGreenSignal({
      jobKey: "baseballCards",
      executionId: "2026-W35",
      completedCount: 440,
      skippedCount: 10,
      expectedCount: 450,
      durationMs: 185000,
    });
    assert.ok(msg.includes("Job Verified"));
    assert.ok(msg.includes("baseballCards"));
    assert.ok(msg.includes("2026-W35"));
    assert.ok(msg.includes("440 completed"));
    assert.ok(msg.includes("10 skipped"));
    assert.ok(msg.includes("450 expected"));
    assert.ok(msg.includes("3m 5s"));
  });

  test("never contains student identifiers", () => {
    const msg = formatGreenSignal({
      jobKey: "soulRegen",
      executionId: "2026-09",
      completedCount: 5,
      skippedCount: 0,
      expectedCount: 5,
      durationMs: 60000,
    });
    // No student-id-like patterns (alphanumeric 20+ chars)
    assert.ok(!msg.match(/[a-zA-Z0-9]{20,}/));
  });
});

describe("formatRedSignal", () => {
  test("includes failure counts and dominant category", () => {
    const msg = formatRedSignal({
      jobKey: "soulRegen",
      executionId: "2026-09",
      completedCount: 400,
      skippedCount: 5,
      failedCount: 37,
      missingCount: 8,
      unverifiedCount: 0,
      expectedCount: 450,
      dominantFailureCategory: "provider_quota",
      durationMs: 7200000,
    });
    assert.ok(msg.includes("Job Failed"));
    assert.ok(msg.includes("45 problem(s)"));
    assert.ok(msg.includes("37 failed"));
    assert.ok(msg.includes("8 missing"));
    assert.ok(msg.includes("provider_quota"));
    assert.ok(msg.includes("2h 0m"));
  });

  test("includes unverified count when present", () => {
    const msg = formatRedSignal({
      jobKey: "baseballCards",
      executionId: "2026-W35",
      completedCount: 440,
      skippedCount: 0,
      failedCount: 0,
      missingCount: 0,
      unverifiedCount: 10,
      expectedCount: 450,
      durationMs: 100000,
    });
    assert.ok(msg.includes("10 unverified"));
  });

  test("omits dominant category when null", () => {
    const msg = formatRedSignal({
      jobKey: "cleanupDeletedChats",
      executionId: "2026-09",
      completedCount: 3,
      skippedCount: 0,
      failedCount: 2,
      missingCount: 0,
      expectedCount: 5,
    });
    assert.ok(!msg.includes("Dominant cause"));
  });
});

describe("formatMissedStartSignal", () => {
  test("includes jobKey and executionId", () => {
    const msg = formatMissedStartSignal("soulRegen", "2026-09");
    assert.ok(msg.includes("Job Never Started"));
    assert.ok(msg.includes("soulRegen"));
    assert.ok(msg.includes("2026-09"));
  });
});

describe("formatCrashSignal", () => {
  test("includes crash details", () => {
    const msg = formatCrashSignal("baseballCards", "2026-W35", "provider_quota", "No credits");
    assert.ok(msg.includes("Job Crashed"));
    assert.ok(msg.includes("baseballCards"));
    assert.ok(msg.includes("provider_quota"));
    assert.ok(msg.includes("No credits"));
  });

  test("truncates long detail to 200 chars", () => {
    const longDetail = "x".repeat(300);
    const msg = formatCrashSignal("test", "2026-01", "unknown", longDetail);
    // The detail portion should be truncated
    const detailLine = msg.split("\n").find((l) => l.startsWith("Detail:"));
    assert.ok(detailLine.length <= 210); // "Detail: " + 200 chars
  });

  test("omits detail line when not provided", () => {
    const msg = formatCrashSignal("test", "2026-01", "unknown");
    assert.ok(!msg.includes("Detail:"));
  });

  test("escapes HTML in all fields", () => {
    const msg = formatCrashSignal("test<job>", "2026-01", "un&known", "<script>");
    assert.ok(!msg.includes("<job>"));
    assert.ok(!msg.includes("<script>"));
    assert.ok(msg.includes("&lt;job&gt;"));
  });
});

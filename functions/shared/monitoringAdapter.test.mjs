/**
 * Tests for monitoring adapter (#229).
 *
 * Run with: node --test functions/shared/monitoringAdapter.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { emit, registerProvider } from "./monitoringAdapter.js";

describe("monitoring adapter", () => {
  test("emit resolves without error with default NoOp provider", async () => {
    await emit("start", { jobKey: "test", executionId: "2026-09" });
    // No assertion needed - just confirm it does not throw
  });

  test("emit dispatches to registered provider", async () => {
    const calls = [];
    registerProvider({
      emit(event, payload) {
        calls.push({ event, payload });
      },
    });

    await emit("success", { jobKey: "baseballCards", executionId: "2026-W35" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].event, "success");
    assert.equal(calls[0].payload.jobKey, "baseballCards");

    // Reset to no-op so other tests are not affected
    registerProvider({ emit() {} });
  });

  test("emit swallows provider errors without throwing", async () => {
    registerProvider({
      emit() {
        throw new Error("provider exploded");
      },
    });

    // Should not throw
    await emit("failure", { jobKey: "test" });

    // Reset
    registerProvider({ emit() {} });
  });
});

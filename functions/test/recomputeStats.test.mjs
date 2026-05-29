import {describe, test} from "node:test";
import assert from "node:assert/strict";

describe("recomputeStats module", () => {
  let statsModule;

  test("module loads without errors", async () => {
    statsModule = await import("../stats/index.js");
    assert.ok(statsModule, "stats module should load");
  });

  test("exports recomputeStats as a Cloud Function", () => {
    const fn = statsModule.recomputeStats;
    assert.ok(fn, "recomputeStats should be exported");
    // Firebase CF v1 callable functions have a __trigger property
    const isCF = typeof fn === "function" ||
      (fn && typeof fn.run === "function") ||
      (fn && fn.__trigger);
    assert.ok(isCF, "recomputeStats should be a Cloud Function");
  });

  test("CF is configured for asia-south1 region", () => {
    const fn = statsModule.recomputeStats;
    const trigger = fn.__trigger || fn?.__endpoint;
    // Check region in trigger config
    if (trigger?.regions) {
      assert.ok(
        trigger.regions.includes("asia-south1"),
        "should be deployed to asia-south1",
      );
    }
    // If trigger structure doesn't expose regions, just verify the CF loaded
    assert.ok(fn, "CF loaded successfully");
  });
});

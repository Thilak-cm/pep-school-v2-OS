import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessTestBench,
  hasFeatureAccess,
  filterFeaturesByAccess,
} from "./accessUtils.js";
import { ACTIVE_FEATURES } from "./featureRegistry.js";

// ---------------------------------------------------------------------------
// canAccessTestBench
// ---------------------------------------------------------------------------

describe("canAccessTestBench", () => {
  test("superadmin can always access, even without an access doc", () => {
    assert.equal(canAccessTestBench("superadmin", null), true);
    assert.equal(canAccessTestBench("superadmin", undefined), true);
  });

  test("teacher with at least one allowed feature can access", () => {
    assert.equal(
      canAccessTestBench("teacher", { allowedFeatures: ["handwriting_analysis"] }),
      true,
    );
  });

  test("teacher with empty allowedFeatures cannot access", () => {
    assert.equal(
      canAccessTestBench("teacher", { allowedFeatures: [] }),
      false,
    );
  });

  test("teacher with no access doc cannot access", () => {
    assert.equal(canAccessTestBench("teacher", null), false);
    assert.equal(canAccessTestBench("teacher", undefined), false);
  });

  test("teacher with malformed access doc (no allowedFeatures) cannot access", () => {
    assert.equal(canAccessTestBench("teacher", {}), false);
    assert.equal(canAccessTestBench("teacher", { allowedFeatures: "not-array" }), false);
  });

  test("classroomadmin with access doc can access", () => {
    assert.equal(
      canAccessTestBench("classroomadmin", { allowedFeatures: ["soul_generation"] }),
      true,
    );
  });

  test("unknown role cannot access even with access doc", () => {
    assert.equal(
      canAccessTestBench("viewer", { allowedFeatures: ["soul_generation"] }),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// hasFeatureAccess
// ---------------------------------------------------------------------------

describe("hasFeatureAccess", () => {
  test("superadmin has access to any feature", () => {
    assert.equal(hasFeatureAccess("handwriting_analysis", "superadmin", null), true);
    assert.equal(hasFeatureAccess("soul_generation", "superadmin", []), true);
  });

  test("teacher with feature in allowedFeatures has access", () => {
    assert.equal(
      hasFeatureAccess("soul_generation", "teacher", ["soul_generation", "handwriting_analysis"]),
      true,
    );
  });

  test("teacher without feature in allowedFeatures is denied", () => {
    assert.equal(
      hasFeatureAccess("interview_question_gen", "teacher", ["soul_generation"]),
      false,
    );
  });

  test("teacher with null/undefined allowedFeatures is denied", () => {
    assert.equal(hasFeatureAccess("soul_generation", "teacher", null), false);
    assert.equal(hasFeatureAccess("soul_generation", "teacher", undefined), false);
  });
});

// ---------------------------------------------------------------------------
// filterFeaturesByAccess
// ---------------------------------------------------------------------------

describe("filterFeaturesByAccess", () => {
  test("superadmin sees all active features", () => {
    const result = filterFeaturesByAccess("superadmin", null);
    assert.equal(result.length, ACTIVE_FEATURES.length);
    assert.deepEqual(result, ACTIVE_FEATURES);
  });

  test("teacher sees only allowed features", () => {
    const result = filterFeaturesByAccess("teacher", ["handwriting_analysis"]);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "handwriting_analysis");
  });

  test("teacher with multiple allowed features sees all of them", () => {
    const result = filterFeaturesByAccess("teacher", [
      "handwriting_analysis",
      "interview_question_gen",
    ]);
    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((f) => f.id),
      ["handwriting_analysis", "interview_question_gen"],
    );
  });

  test("teacher with no allowedFeatures sees nothing", () => {
    assert.deepEqual(filterFeaturesByAccess("teacher", null), []);
    assert.deepEqual(filterFeaturesByAccess("teacher", undefined), []);
  });

  test("feature ID not in registry is silently ignored", () => {
    const result = filterFeaturesByAccess("teacher", ["nonexistent_feature"]);
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// featureRegistry — coming-soon cleanup verification
// ---------------------------------------------------------------------------

describe("featureRegistry cleanup", () => {
  test("ACTIVE_FEATURES contains only the 3 active features", () => {
    assert.equal(ACTIVE_FEATURES.length, 3);
    const ids = ACTIVE_FEATURES.map((f) => f.id);
    assert.ok(ids.includes("handwriting_analysis"));
    assert.ok(ids.includes("soul_generation"));
    assert.ok(ids.includes("interview_question_gen"));
  });

  test("COMING_SOON_FEATURES export no longer exists", async () => {
    const mod = await import("./featureRegistry.js");
    assert.equal(mod.COMING_SOON_FEATURES, undefined);
  });
});

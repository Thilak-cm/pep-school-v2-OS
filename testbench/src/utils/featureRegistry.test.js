/**
 * PEP-235: Feature registry tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FEATURES, ACTIVE_FEATURES } from "./featureRegistry.js";

describe("featureRegistry", () => {
  it("includes monthly_plan as an active feature", () => {
    const monthlyPlan = FEATURES.find((f) => f.id === "monthly_plan");
    assert.ok(monthlyPlan, "monthly_plan should exist in FEATURES");
    assert.equal(monthlyPlan.status, "active");
    assert.equal(monthlyPlan.configDoc, "monthly_plan");
  });

  it("monthly_plan appears in ACTIVE_FEATURES", () => {
    const active = ACTIVE_FEATURES.find((f) => f.id === "monthly_plan");
    assert.ok(active, "monthly_plan should appear in ACTIVE_FEATURES");
  });

  it("has 4 active features", () => {
    assert.equal(ACTIVE_FEATURES.length, 4);
  });

  it("every feature has required fields", () => {
    for (const f of FEATURES) {
      assert.ok(f.id, `feature missing id`);
      assert.ok(f.label, `${f.id} missing label`);
      assert.ok(f.description, `${f.id} missing description`);
      assert.ok(f.configDoc, `${f.id} missing configDoc`);
      assert.ok(f.status, `${f.id} missing status`);
    }
  });
});

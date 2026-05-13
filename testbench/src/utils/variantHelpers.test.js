/**
 * PEP-223: Variant helper tests
 *
 * Tests pure logic for variant creation, update, and work detection.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createVariant, updateVariant, hasUnsavedWork, MODELS_BY_PROVIDER, SCROLL_AFTER } from "./variantHelpers.js";

describe("createVariant", () => {
  it("creates a default variant with letter-based name", () => {
    const v = createVariant(null, 0);
    assert.equal(v.name, "Variant A");
    assert.equal(v.output, null);
    assert.equal(v.loading, false);
    assert.equal(v.dirty, false);
    assert.equal(v.rating, 5);
    assert.equal(v.notes, "");
  });

  it("uses config values when provided", () => {
    const config = { systemPrompt: "test prompt", model: "gpt-4o", temperature: 0.7, max_tokens: 4000 };
    const v = createVariant(config, 1);
    assert.equal(v.name, "Variant B");
    assert.equal(v.systemPrompt, "test prompt");
    assert.equal(v.model, "gpt-4o");
    assert.equal(v.temperature, 0.7);
    assert.equal(v.max_tokens, 4000);
  });

  it("handles temperature of 0 correctly (not treated as falsy)", () => {
    const v = createVariant({ temperature: 0 }, 0);
    assert.equal(v.temperature, 0);
  });

  it("names variants sequentially: A, B, C, D...", () => {
    assert.equal(createVariant(null, 0).name, "Variant A");
    assert.equal(createVariant(null, 1).name, "Variant B");
    assert.equal(createVariant(null, 2).name, "Variant C");
    assert.equal(createVariant(null, 3).name, "Variant D");
  });

  it("preserves guidelinesContent from config", () => {
    const v = createVariant({ guidelinesContent: "## Areas\n- Math" }, 0);
    assert.equal(v.guidelinesContent, "## Areas\n- Math");
  });
});

describe("updateVariant", () => {
  it("updates the specified field at the given index and marks dirty", () => {
    const variants = [createVariant(null, 0), createVariant(null, 1)];
    const result = updateVariant(variants, 1, "model", "gpt-4o");
    assert.equal(result[1].model, "gpt-4o");
    assert.equal(result[1].dirty, true);
    assert.equal(result[0].dirty, false); // other variant unchanged
  });

  it("does not mutate the original array", () => {
    const variants = [createVariant(null, 0)];
    const result = updateVariant(variants, 0, "temperature", 0.9);
    assert.notEqual(result, variants);
    assert.notEqual(result[0], variants[0]);
  });
});

describe("hasUnsavedWork", () => {
  it("returns false for fresh variants", () => {
    const variants = [createVariant(null, 0), createVariant(null, 1)];
    assert.equal(hasUnsavedWork(variants), false);
  });

  it("returns true if any variant is dirty", () => {
    const variants = [createVariant(null, 0), { ...createVariant(null, 1), dirty: true }];
    assert.equal(hasUnsavedWork(variants), true);
  });

  it("returns true if any variant has output", () => {
    const variants = [{ ...createVariant(null, 0), output: "some result" }];
    assert.equal(hasUnsavedWork(variants), true);
  });
});

describe("MODELS_BY_PROVIDER", () => {
  it("is a non-empty array of provider groups", () => {
    assert.ok(Array.isArray(MODELS_BY_PROVIDER));
    assert.ok(MODELS_BY_PROVIDER.length > 0);
  });

  it("each group has provider string and non-empty models array", () => {
    for (const group of MODELS_BY_PROVIDER) {
      assert.equal(typeof group.provider, "string");
      assert.ok(Array.isArray(group.models));
      assert.ok(group.models.length > 0);
    }
  });
});

describe("SCROLL_AFTER", () => {
  it("is the threshold for when columns switch to scroll mode", () => {
    assert.equal(typeof SCROLL_AFTER, "number");
    assert.equal(SCROLL_AFTER, 4);
  });
});

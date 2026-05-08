import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FRONTIER_MODEL,
  MINI_MODEL,
  AVAILABLE_MODELS,
  getOpenRouterModelId,
} from "../config/modelConstants.js";

describe("modelConstants", () => {
  describe("FRONTIER_MODEL", () => {
    it("should be a non-empty string", () => {
      assert.equal(typeof FRONTIER_MODEL, "string");
      assert.ok(FRONTIER_MODEL.length > 0);
    });
  });

  describe("MINI_MODEL", () => {
    it("should be a non-empty string", () => {
      assert.equal(typeof MINI_MODEL, "string");
      assert.ok(MINI_MODEL.length > 0);
    });
  });

  describe("AVAILABLE_MODELS", () => {
    it("should be a non-empty array", () => {
      assert.ok(Array.isArray(AVAILABLE_MODELS));
      assert.ok(AVAILABLE_MODELS.length > 0);
    });

    it("each entry should have id, label, tier, provider, and openRouterId", () => {
      for (const m of AVAILABLE_MODELS) {
        assert.ok(m.id, `missing id: ${JSON.stringify(m)}`);
        assert.ok(m.label, `missing label: ${JSON.stringify(m)}`);
        assert.ok(
          m.tier === "frontier" || m.tier === "mini",
          `invalid tier: ${m.tier} for ${m.id}`,
        );
        assert.ok(m.provider, `missing provider for ${m.id}`);
        assert.ok(m.openRouterId, `missing openRouterId for ${m.id}`);
        assert.equal(typeof m.supportsJsonMode, "boolean", `supportsJsonMode must be boolean for ${m.id}`);
      }
    });

    it("should include FRONTIER_MODEL as an option", () => {
      const ids = AVAILABLE_MODELS.map((m) => m.id);
      assert.ok(ids.includes(FRONTIER_MODEL));
    });

    it("should include MINI_MODEL as an option", () => {
      const ids = AVAILABLE_MODELS.map((m) => m.id);
      assert.ok(ids.includes(MINI_MODEL));
    });

    it("should contain models from at least 4 providers", () => {
      const providers = new Set(AVAILABLE_MODELS.map((m) => m.provider));
      assert.ok(providers.size >= 4, `only ${providers.size} providers found: ${[...providers].join(", ")}`);
    });

    it("should include OpenAI, Google, and Anthropic providers", () => {
      const providers = new Set(AVAILABLE_MODELS.map((m) => m.provider));
      assert.ok(providers.has("OpenAI"), "missing OpenAI provider");
      assert.ok(providers.has("Google"), "missing Google provider");
      assert.ok(providers.has("Anthropic"), "missing Anthropic provider");
    });

    it("openRouterId should follow vendor/model format", () => {
      for (const m of AVAILABLE_MODELS) {
        assert.ok(
          m.openRouterId.includes("/"),
          `openRouterId should contain '/': ${m.openRouterId}`,
        );
      }
    });
  });

  describe("getOpenRouterModelId", () => {
    it("should return the openRouterId for a known model", () => {
      const result = getOpenRouterModelId(FRONTIER_MODEL);
      assert.ok(result.includes("/"), `expected vendor/model format, got: ${result}`);
    });

    it("should return the input as-is for an unknown model", () => {
      const result = getOpenRouterModelId("unknown-model-xyz");
      assert.equal(result, "unknown-model-xyz");
    });
  });
});

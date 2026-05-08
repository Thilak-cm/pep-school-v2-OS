import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FRONTIER_MODEL } from "../config/modelConstants.js";
import {
  TEST_BENCH_MODELS,
  getOpenRouterModelId,
  getModelSupportsJson,
} from "../config/testBenchModels.js";

describe("testBenchModels", () => {
  describe("TEST_BENCH_MODELS", () => {
    it("should be a non-empty array with 15+ models", () => {
      assert.ok(Array.isArray(TEST_BENCH_MODELS));
      assert.ok(TEST_BENCH_MODELS.length >= 15, `only ${TEST_BENCH_MODELS.length} models found`);
    });

    it("each entry should have id, label, tier, provider, openRouterId, and supportsJsonMode", () => {
      for (const m of TEST_BENCH_MODELS) {
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

    it("should contain models from at least 4 providers", () => {
      const providers = new Set(TEST_BENCH_MODELS.map((m) => m.provider));
      assert.ok(providers.size >= 4, `only ${providers.size} providers found: ${[...providers].join(", ")}`);
    });

    it("should include OpenAI, Google, and Anthropic providers", () => {
      const providers = new Set(TEST_BENCH_MODELS.map((m) => m.provider));
      assert.ok(providers.has("OpenAI"), "missing OpenAI provider");
      assert.ok(providers.has("Google"), "missing Google provider");
      assert.ok(providers.has("Anthropic"), "missing Anthropic provider");
    });

    it("openRouterId should follow vendor/model format", () => {
      for (const m of TEST_BENCH_MODELS) {
        assert.ok(
          m.openRouterId.includes("/"),
          `openRouterId should contain '/': ${m.openRouterId}`,
        );
      }
    });

    it("should not have duplicate ids", () => {
      const ids = TEST_BENCH_MODELS.map((m) => m.id);
      const unique = new Set(ids);
      assert.equal(unique.size, ids.length, `duplicate ids found: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
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

  describe("getModelSupportsJson", () => {
    it("should return true for OpenAI models", () => {
      assert.equal(getModelSupportsJson("gpt-5.4"), true);
    });

    it("should return false for Anthropic models", () => {
      assert.equal(getModelSupportsJson("claude-opus-4.6"), false);
    });

    it("should default to true for unknown models", () => {
      assert.equal(getModelSupportsJson("unknown-model"), true);
    });
  });
});

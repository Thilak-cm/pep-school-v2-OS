import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FRONTIER_MODEL,
  MINI_MODEL,
  AVAILABLE_MODELS,
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

    it("should only contain OpenAI models (production use)", () => {
      for (const m of AVAILABLE_MODELS) {
        assert.equal(m.provider, "OpenAI", `non-OpenAI model found in production list: ${m.id}`);
      }
    });
  });
});

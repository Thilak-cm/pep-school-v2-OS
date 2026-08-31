/**
 * Tests for push-model-registry helpers (#187).
 * Run: node --test scripts/ops/push-model-registry.helpers.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_FEATURES,
  readRegistryFile,
  isValidSlug,
  validateRegistry,
  diffRegistry,
  formatDiffSummary,
} from "./push-model-registry.helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const REGISTRY_PATH = join(REPO_ROOT, "brain", "model-registry.json");

// ---------------------------------------------------------------------------
// isValidSlug
// ---------------------------------------------------------------------------

describe("isValidSlug", () => {
  it("accepts vendor/model format", () => {
    assert.equal(isValidSlug("openai/gpt-5.4"), true);
    assert.equal(isValidSlug("openai/gpt-5.4-mini"), true);
    assert.equal(isValidSlug("openai/gpt-4.1-mini"), true);
    assert.equal(isValidSlug("anthropic/claude-4.6-sonnet"), true);
  });

  it("rejects bare model names without vendor prefix", () => {
    assert.equal(isValidSlug("gpt-5.4"), false);
    assert.equal(isValidSlug("gpt-5.4-mini"), false);
  });

  it("rejects empty or whitespace", () => {
    assert.equal(isValidSlug(""), false);
    assert.equal(isValidSlug("openai/ gpt-5.4"), false);
    assert.equal(isValidSlug(" openai/gpt-5.4"), false);
  });

  it("rejects multiple slashes", () => {
    assert.equal(isValidSlug("openai/gpt-5.4/extra"), false);
  });

  it("rejects non-strings", () => {
    assert.equal(isValidSlug(null), false);
    assert.equal(isValidSlug(undefined), false);
    assert.equal(isValidSlug(42), false);
  });

  it("rejects missing vendor or model", () => {
    assert.equal(isValidSlug("/gpt-5.4"), false);
    assert.equal(isValidSlug("openai/"), false);
  });
});

// ---------------------------------------------------------------------------
// validateRegistry
// ---------------------------------------------------------------------------

describe("validateRegistry", () => {
  it("passes for the actual brain/model-registry.json", () => {
    const registry = readRegistryFile(REGISTRY_PATH);
    const errors = validateRegistry(registry);
    assert.deepEqual(errors, [], `Validation errors: ${errors.join("; ")}`);
  });

  it("requires all 13 features", () => {
    assert.equal(REQUIRED_FEATURES.length, 13);
    const registry = { text_cleanup: { "gpt-5.4-nano": "openai/gpt-5.4-nano" } };
    const errors = validateRegistry(registry);
    // Should have 12 missing-feature errors
    const missing = errors.filter((e) => e.startsWith("Missing required feature"));
    assert.equal(missing.length, 12);
  });

  it("rejects unknown features", () => {
    const registry = readRegistryFile(REGISTRY_PATH);
    registry.unknown_feature = { "gpt-5.4": "openai/gpt-5.4" };
    const errors = validateRegistry(registry);
    assert.ok(errors.some((e) => e.includes("Unknown feature: unknown_feature")));
  });

  it("rejects bare model names as slug values", () => {
    const registry = readRegistryFile(REGISTRY_PATH);
    registry.coach = { "gpt-5.4": "gpt-5.4" }; // missing vendor prefix
    const errors = validateRegistry(registry);
    assert.ok(errors.some((e) => e.includes("coach.gpt-5.4") && e.includes("invalid slug")));
  });

  it("rejects empty alias maps", () => {
    const registry = readRegistryFile(REGISTRY_PATH);
    registry.coach = {};
    const errors = validateRegistry(registry);
    assert.ok(errors.some((e) => e.includes("coach") && e.includes("at least one alias")));
  });

  it("rejects non-object registry", () => {
    const errors = validateRegistry("not an object");
    assert.ok(errors.some((e) => e.includes("plain object")));
  });
});

// ---------------------------------------------------------------------------
// diffRegistry
// ---------------------------------------------------------------------------

describe("diffRegistry", () => {
  it("treats all features as added when remote is null", () => {
    const local = {
      coach: { "gpt-5.4": "openai/gpt-5.4" },
      chat: { "gpt-5-mini": "openai/gpt-5-mini" },
    };
    const diff = diffRegistry(local, null);
    assert.deepEqual(diff.added, ["coach", "chat"]);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.unchanged, []);
  });

  it("detects changed features", () => {
    const local = { coach: { "gpt-5.4": "openai/gpt-5.4" } };
    const remote = { coach: { "gpt-5.4": "openai/gpt-5.4-mini" } };
    const diff = diffRegistry(local, remote);
    assert.deepEqual(diff.changed, ["coach"]);
    assert.deepEqual(diff.unchanged, []);
  });

  it("detects removed features", () => {
    const local = { coach: { "gpt-5.4": "openai/gpt-5.4" } };
    const remote = {
      coach: { "gpt-5.4": "openai/gpt-5.4" },
      old_feature: { "gpt-5.4": "openai/gpt-5.4" },
    };
    const diff = diffRegistry(local, remote);
    assert.deepEqual(diff.removed, ["old_feature"]);
    assert.deepEqual(diff.unchanged, ["coach"]);
  });

  it("detects unchanged features", () => {
    const local = { coach: { "gpt-5.4": "openai/gpt-5.4" } };
    const remote = { coach: { "gpt-5.4": "openai/gpt-5.4" } };
    const diff = diffRegistry(local, remote);
    assert.deepEqual(diff.unchanged, ["coach"]);
    assert.deepEqual(diff.added, []);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
  });

  it("ignores underscore-prefixed keys", () => {
    const local = {
      _description: "ignored",
      coach: { "gpt-5.4": "openai/gpt-5.4" },
    };
    const remote = { coach: { "gpt-5.4": "openai/gpt-5.4" } };
    const diff = diffRegistry(local, remote);
    assert.deepEqual(diff.unchanged, ["coach"]);
    assert.deepEqual(diff.added, []);
  });
});

// ---------------------------------------------------------------------------
// formatDiffSummary
// ---------------------------------------------------------------------------

describe("formatDiffSummary", () => {
  it("formats all diff types", () => {
    const summary = formatDiffSummary({
      added: ["coach"],
      changed: ["chat"],
      removed: ["old"],
      unchanged: ["report"],
    });
    assert.ok(summary.includes("+ Added (1): coach"));
    assert.ok(summary.includes("~ Changed (1): chat"));
    assert.ok(summary.includes("- Removed (1): old"));
    assert.ok(summary.includes("= Unchanged (1): report"));
  });

  it("handles empty diff", () => {
    const summary = formatDiffSummary({
      added: [], changed: [], removed: [], unchanged: [],
    });
    assert.ok(summary.includes("no features found"));
  });
});

// ---------------------------------------------------------------------------
// readRegistryFile (integration - reads actual file)
// ---------------------------------------------------------------------------

describe("readRegistryFile", () => {
  it("reads and parses brain/model-registry.json", () => {
    const registry = readRegistryFile(REGISTRY_PATH);
    assert.equal(typeof registry, "object");
    assert.ok(registry.coach, "Should have coach feature");
    assert.ok(registry.chat, "Should have chat feature");
  });

  it("throws on missing file", () => {
    assert.throws(() => readRegistryFile("/nonexistent/path.json"));
  });
});

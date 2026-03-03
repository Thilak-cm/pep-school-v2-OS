import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeReportConfig } from "../utils/reportHelpers.js";
import { REPORT_DEFAULTS } from "../config/reportConstants.js";

// ---------------------------------------------------------------------------
// Double-merge config chain (as used in runSingleReport)
// Pattern: mergeReportConfig(configOverrides, mergeReportConfig(firestoreData, REPORT_DEFAULTS))
// ---------------------------------------------------------------------------

describe("previewStudentReport config override chain", () => {
  it("applies Firestore layer then playground overrides via double merge", () => {
    const firestoreData = { model: "gpt-4-turbo", temperature: 0.5 };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    // Playground overrides only temperature
    const playgroundOverrides = { temperature: 0.9 };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.model, "gpt-4-turbo"); // from Firestore layer
    assert.equal(final.temperature, 0.9); // from playground override
    assert.equal(final.max_tokens, REPORT_DEFAULTS.max_tokens); // from defaults
    assert.equal(final.timezone, REPORT_DEFAULTS.timezone); // from defaults
  });

  it("falls through to defaults when both layers are empty", () => {
    const baseConfig = mergeReportConfig({}, REPORT_DEFAULTS);
    const final = mergeReportConfig({}, baseConfig);

    assert.deepStrictEqual(final, {
      model: REPORT_DEFAULTS.model,
      temperature: REPORT_DEFAULTS.temperature,
      max_tokens: REPORT_DEFAULTS.max_tokens,
      timezone: REPORT_DEFAULTS.timezone,
    });
  });

  it("playground override wins over Firestore for same key", () => {
    const firestoreData = { model: "gpt-4-turbo", max_tokens: 8192 };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    const playgroundOverrides = { model: "gpt-4o-mini", max_tokens: 2048 };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.model, "gpt-4o-mini");
    assert.equal(final.max_tokens, 2048);
  });

  it("Firestore layer overrides defaults, playground is null (no override)", () => {
    const firestoreData = { model: "gpt-4", timezone: "UTC" };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    // When configOverrides is null, runSingleReport uses baseConfig directly
    const final = baseConfig;
    assert.equal(final.model, "gpt-4");
    assert.equal(final.timezone, "UTC");
    assert.equal(final.temperature, REPORT_DEFAULTS.temperature);
    assert.equal(final.max_tokens, REPORT_DEFAULTS.max_tokens);
  });

  it("invalid numeric override in playground falls back to Firestore value", () => {
    const firestoreData = { temperature: 0.3, max_tokens: 2048 };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    // Playground sends NaN for temperature
    const playgroundOverrides = { temperature: NaN };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.temperature, 0.3); // falls back to baseConfig (Firestore value)
    assert.equal(final.max_tokens, 2048); // untouched Firestore value
  });

  it("empty string model in playground falls back to Firestore value", () => {
    const firestoreData = { model: "gpt-4-turbo" };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    const playgroundOverrides = { model: "" };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.model, "gpt-4-turbo"); // falls back to baseConfig
  });

  it("temperature of 0 in playground is preserved (not treated as falsy)", () => {
    const firestoreData = { temperature: 0.7 };
    const baseConfig = mergeReportConfig(firestoreData, REPORT_DEFAULTS);

    const playgroundOverrides = { temperature: 0 };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.temperature, 0); // 0 is a valid temperature
  });
});

// ---------------------------------------------------------------------------
// Prompt override logic (as used in runSingleReport)
// Pattern: { ...existingPrompt, systemPrompt: promptOverride }
// ---------------------------------------------------------------------------

describe("previewStudentReport prompt override logic", () => {
  it("replaces only systemPrompt while preserving title and description", () => {
    const existingPrompt = {
      title: "Adolescent Report",
      description: "Generate a Montessori progress report",
      systemPrompt: "Original system prompt content",
    };

    const promptOverride = "Custom playground system prompt";
    const result = { ...existingPrompt, systemPrompt: promptOverride };

    assert.equal(result.title, "Adolescent Report");
    assert.equal(result.description, "Generate a Montessori progress report");
    assert.equal(result.systemPrompt, "Custom playground system prompt");
  });

  it("preserves all fields when promptOverride is null (no spread override)", () => {
    const existingPrompt = {
      title: "Elementary Report",
      description: "Elementary program report",
      systemPrompt: "You are a Montessori teacher...",
    };

    // When promptOverride is null, runSingleReport uses existingPrompt directly
    const result = existingPrompt;
    assert.equal(result.systemPrompt, "You are a Montessori teacher...");
    assert.equal(result.title, "Elementary Report");
  });

  it("handles empty existingPrompt fields with override", () => {
    const existingPrompt = {
      title: "",
      description: "",
      systemPrompt: "",
    };

    const promptOverride = "New prompt from playground";
    const result = { ...existingPrompt, systemPrompt: promptOverride };

    assert.equal(result.title, "");
    assert.equal(result.description, "");
    assert.equal(result.systemPrompt, "New prompt from playground");
  });
});

// ---------------------------------------------------------------------------
// Input validation patterns (as used in previewStudentReport callable)
// ---------------------------------------------------------------------------

describe("previewStudentReport input validation patterns", () => {
  // Pattern: String(data?.studentId || "").trim()
  describe("studentId validation", () => {
    it("trims whitespace from studentId", () => {
      const data = { studentId: "  abc123  " };
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "abc123");
    });

    it("produces empty string for null studentId", () => {
      const data = { studentId: null };
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "");
    });

    it("produces empty string for undefined studentId", () => {
      const data = {};
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "");
    });

    it("produces empty string for empty string studentId", () => {
      const data = { studentId: "" };
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "");
    });

    it("produces empty string for whitespace-only studentId", () => {
      const data = { studentId: "   " };
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "");
    });

    it("coerces numeric studentId to string", () => {
      const data = { studentId: 12345 };
      const studentId = String(data?.studentId || "").trim();
      assert.equal(studentId, "12345");
    });
  });

  // Pattern: typeof data?.systemPrompt === "string" && data.systemPrompt.trim() ? data.systemPrompt : null
  describe("systemPrompt type checking", () => {
    it("accepts a non-empty string systemPrompt", () => {
      const data = { systemPrompt: "Custom prompt" };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, "Custom prompt");
    });

    it("rejects null systemPrompt", () => {
      const data = { systemPrompt: null };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects undefined systemPrompt", () => {
      const data = {};
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects numeric systemPrompt", () => {
      const data = { systemPrompt: 12345 };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects empty string systemPrompt", () => {
      const data = { systemPrompt: "" };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects whitespace-only systemPrompt", () => {
      const data = { systemPrompt: "   " };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      assert.equal(promptOverride, null);
    });

    it("preserves original string (does not trim) for valid systemPrompt", () => {
      const data = { systemPrompt: "  Padded prompt  " };
      const promptOverride = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
        ? data.systemPrompt
        : null;
      // The original (untrimmed) value is passed through
      assert.equal(promptOverride, "  Padded prompt  ");
    });
  });
});

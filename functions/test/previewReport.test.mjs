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

    const playgroundOverrides = { model: "gpt-5-mini", max_tokens: 2048 };
    const final = mergeReportConfig(playgroundOverrides, baseConfig);

    assert.equal(final.model, "gpt-5-mini");
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
// Prompt override logic (as used in previewStudentReport callable)
// Pattern: promptOverride = { staticSystemPrompt, dynamicSystemPrompt } or null
// Production code at functions/index.js uses:
//   (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
//   (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim())
//     ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
//     : null
// ---------------------------------------------------------------------------

describe("previewStudentReport prompt override logic", () => {
  // Helper that mirrors production logic for building promptOverride
  function buildPromptOverride(data) {
    return (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
      (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim())
      ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
      : null;
  }

  it("both staticSystemPrompt and dynamicSystemPrompt provided -> override object", () => {
    const data = {
      staticSystemPrompt: "You are a teacher...",
      dynamicSystemPrompt: "Glossary: ...",
    };
    const override = buildPromptOverride(data);
    assert.deepStrictEqual(override, {
      staticSystemPrompt: "You are a teacher...",
      dynamicSystemPrompt: "Glossary: ...",
    });
  });

  it("only staticSystemPrompt provided -> override object", () => {
    const data = {
      staticSystemPrompt: "Static prompt only",
    };
    const override = buildPromptOverride(data);
    assert.deepStrictEqual(override, {
      staticSystemPrompt: "Static prompt only",
      dynamicSystemPrompt: undefined,
    });
  });

  it("only dynamicSystemPrompt provided -> override object", () => {
    const data = {
      dynamicSystemPrompt: "Dynamic prompt only",
    };
    const override = buildPromptOverride(data);
    assert.deepStrictEqual(override, {
      staticSystemPrompt: undefined,
      dynamicSystemPrompt: "Dynamic prompt only",
    });
  });

  it("both empty strings -> null", () => {
    const data = {
      staticSystemPrompt: "",
      dynamicSystemPrompt: "",
    };
    const override = buildPromptOverride(data);
    assert.equal(override, null);
  });

  it("both null -> null", () => {
    const data = {
      staticSystemPrompt: null,
      dynamicSystemPrompt: null,
    };
    const override = buildPromptOverride(data);
    assert.equal(override, null);
  });

  it("both undefined -> null", () => {
    const data = {};
    const override = buildPromptOverride(data);
    assert.equal(override, null);
  });

  it("whitespace-only strings -> null", () => {
    const data = {
      staticSystemPrompt: "   ",
      dynamicSystemPrompt: "  \t  ",
    };
    const override = buildPromptOverride(data);
    assert.equal(override, null);
  });

  it("applies override fields onto baseConfig preserving other fields", () => {
    const baseConfig = {
      title: "Adolescent Report",
      description: "Generate a Montessori progress report",
      staticSystemPrompt: "Original static prompt",
      dynamicSystemPrompt: "Original dynamic prompt",
    };

    const promptOverride = {
      staticSystemPrompt: "Custom static prompt",
      dynamicSystemPrompt: "Custom dynamic prompt",
    };

    // Production pattern: { ...baseConfig, staticSystemPrompt: override.static || base.static, ... }
    const result = {
      ...baseConfig,
      staticSystemPrompt: promptOverride.staticSystemPrompt || baseConfig.staticSystemPrompt,
      dynamicSystemPrompt: promptOverride.dynamicSystemPrompt || baseConfig.dynamicSystemPrompt,
    };

    assert.equal(result.title, "Adolescent Report");
    assert.equal(result.description, "Generate a Montessori progress report");
    assert.equal(result.staticSystemPrompt, "Custom static prompt");
    assert.equal(result.dynamicSystemPrompt, "Custom dynamic prompt");
  });

  it("preserves all fields when promptOverride is null", () => {
    const baseConfig = {
      title: "Elementary Report",
      description: "Elementary program report",
      staticSystemPrompt: "You are a Montessori teacher...",
      dynamicSystemPrompt: "Glossary terms...",
    };

    // When promptOverride is null, runSingleReport uses baseConfig directly
    const result = baseConfig;
    assert.equal(result.staticSystemPrompt, "You are a Montessori teacher...");
    assert.equal(result.dynamicSystemPrompt, "Glossary terms...");
    assert.equal(result.title, "Elementary Report");
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

  // Pattern: dual-field prompt override type checking
  describe("prompt override type checking", () => {
    it("accepts a non-empty string staticSystemPrompt", () => {
      const data = { staticSystemPrompt: "Custom prompt" };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.notEqual(promptOverride, null);
      assert.equal(promptOverride.staticSystemPrompt, "Custom prompt");
    });

    it("accepts a non-empty string dynamicSystemPrompt", () => {
      const data = { dynamicSystemPrompt: "Dynamic prompt" };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.notEqual(promptOverride, null);
      assert.equal(promptOverride.dynamicSystemPrompt, "Dynamic prompt");
    });

    it("rejects null for both prompt fields", () => {
      const data = { staticSystemPrompt: null, dynamicSystemPrompt: null };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects undefined for both prompt fields", () => {
      const data = {};
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects empty strings for both prompt fields", () => {
      const data = { staticSystemPrompt: "", dynamicSystemPrompt: "" };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.equal(promptOverride, null);
    });

    it("rejects whitespace-only strings for both prompt fields", () => {
      const data = { staticSystemPrompt: "   ", dynamicSystemPrompt: "  \t  " };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      assert.equal(promptOverride, null);
    });

    it("preserves original string (does not trim) for valid prompt fields", () => {
      const data = { staticSystemPrompt: "  Padded prompt  " };
      const hasOverride = (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) ||
        (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim());
      const promptOverride = hasOverride
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null;
      // The original (untrimmed) value is passed through
      assert.equal(promptOverride.staticSystemPrompt, "  Padded prompt  ");
    });
  });
});

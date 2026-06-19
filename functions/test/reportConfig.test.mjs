import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeReportConfig, getReportPromptDocId } from "../utils/reportHelpers.js";
import {
  REPORT_DEFAULTS,
  REPORT_PROMPT_DOCS,
  MONTHLY_REPORT_PROMPT_DOCS,
  buildMonthlyBaselineCsvFilename,
} from "../config/reportConstants.js";

describe("mergeReportConfig", () => {
  it("returns defaults when docData is null/undefined", () => {
    const result = mergeReportConfig(null, REPORT_DEFAULTS);
    assert.equal(result.model, REPORT_DEFAULTS.model);
    assert.equal(result.temperature, REPORT_DEFAULTS.temperature);
    assert.equal(result.max_tokens, REPORT_DEFAULTS.max_tokens);
    assert.equal(result.timezone, REPORT_DEFAULTS.timezone);
  });

  it("returns defaults when docData is empty object", () => {
    const result = mergeReportConfig({}, REPORT_DEFAULTS);
    assert.equal(result.model, REPORT_DEFAULTS.model);
    assert.equal(result.temperature, REPORT_DEFAULTS.temperature);
    assert.equal(result.max_tokens, REPORT_DEFAULTS.max_tokens);
    assert.equal(result.timezone, REPORT_DEFAULTS.timezone);
  });

  it("overrides model from docData", () => {
    const result = mergeReportConfig({ model: "gpt-4" }, REPORT_DEFAULTS);
    assert.equal(result.model, "gpt-4");
    assert.equal(result.temperature, 0.7);
    assert.equal(result.max_tokens, 4096);
  });

  it("overrides temperature from docData", () => {
    const result = mergeReportConfig({ temperature: 0.3 }, REPORT_DEFAULTS);
    assert.equal(result.temperature, 0.3);
    assert.equal(result.model, REPORT_DEFAULTS.model);
  });

  it("overrides max_tokens from docData", () => {
    const result = mergeReportConfig({ max_tokens: 8192 }, REPORT_DEFAULTS);
    assert.equal(result.max_tokens, 8192);
  });

  it("overrides timezone from docData", () => {
    const result = mergeReportConfig({ timezone: "UTC" }, REPORT_DEFAULTS);
    assert.equal(result.timezone, "UTC");
  });

  it("falls back to default when temperature is not a finite number", () => {
    const result = mergeReportConfig({ temperature: "warm" }, REPORT_DEFAULTS);
    assert.equal(result.temperature, 0.7);
  });

  it("falls back to default when max_tokens is NaN", () => {
    const result = mergeReportConfig({ max_tokens: NaN }, REPORT_DEFAULTS);
    assert.equal(result.max_tokens, 4096);
  });

  it("falls back to default when max_tokens is Infinity", () => {
    const result = mergeReportConfig({ max_tokens: Infinity }, REPORT_DEFAULTS);
    assert.equal(result.max_tokens, 4096);
  });

  it("falls back to default when model is empty string", () => {
    const result = mergeReportConfig({ model: "" }, REPORT_DEFAULTS);
    assert.equal(result.model, REPORT_DEFAULTS.model);
  });

  it("merges multiple overrides at once", () => {
    const result = mergeReportConfig(
      { model: "gpt-4-turbo", temperature: 0.5, max_tokens: 2048, timezone: "UTC" },
      REPORT_DEFAULTS,
    );
    assert.deepStrictEqual(result, {
      model: "gpt-4-turbo",
      temperature: 0.5,
      max_tokens: 2048,
      timezone: "UTC",
    });
  });

  it("ignores unknown fields from docData", () => {
    const result = mergeReportConfig({ foo: "bar", model: "gpt-4" }, REPORT_DEFAULTS);
    assert.equal(result.model, "gpt-4");
    assert.equal(result.foo, undefined);
  });

  it("accepts temperature of 0", () => {
    const result = mergeReportConfig({ temperature: 0 }, REPORT_DEFAULTS);
    assert.equal(result.temperature, 0);
  });
});

describe("MONTHLY_REPORT_PROMPT_DOCS", () => {
  it("has entries for all programs matching REPORT_PROMPT_DOCS keys", () => {
    const termPrograms = Object.keys(REPORT_PROMPT_DOCS).sort();
    const monthlyPrograms = Object.keys(MONTHLY_REPORT_PROMPT_DOCS).sort();
    assert.deepStrictEqual(monthlyPrograms, termPrograms);
  });

  it("uses report_monthly_ prefix for all doc IDs", () => {
    for (const [program, docId] of Object.entries(MONTHLY_REPORT_PROMPT_DOCS)) {
      assert.ok(
        docId.startsWith("report_monthly_"),
        `Expected ${program} doc ID to start with report_monthly_, got ${docId}`,
      );
    }
  });

  it("doc IDs do not collide with term report doc IDs", () => {
    const termIds = new Set(Object.values(REPORT_PROMPT_DOCS));
    for (const docId of Object.values(MONTHLY_REPORT_PROMPT_DOCS)) {
      assert.ok(!termIds.has(docId), `Monthly doc ID ${docId} collides with term doc`);
    }
  });
});

describe("buildMonthlyBaselineCsvFilename", () => {
  it("includes classroom name and Monthly Baseline Report label", () => {
    const result = buildMonthlyBaselineCsvFilename("Periwinkle");
    assert.ok(result.includes("Periwinkle"), "should include classroom name");
    assert.ok(result.includes("Monthly Baseline Report"), "should include report type label");
    assert.ok(result.endsWith(".csv"), "should end with .csv");
  });

  it("includes a month/year label", () => {
    const result = buildMonthlyBaselineCsvFilename("Allstars");
    // Should contain a month-year pattern (e.g. "June 2026")
    assert.ok(/[A-Z][a-z]+ \d{4}/.test(result), `Expected month-year in filename, got: ${result}`);
  });
});

describe("getReportPromptDocId with reportType", () => {
  it("returns term doc ID by default (no reportType)", () => {
    assert.equal(getReportPromptDocId("primary"), "report_primary");
  });

  it("returns term doc ID when reportType is 'term'", () => {
    assert.equal(getReportPromptDocId("primary", "term"), "report_primary");
  });

  it("returns monthly doc ID when reportType is 'monthly'", () => {
    assert.equal(getReportPromptDocId("primary", "monthly"), "report_monthly_primary");
  });

  it("returns monthly doc ID for elementary", () => {
    assert.equal(getReportPromptDocId("elementary", "monthly"), "report_monthly_elementary");
  });

  it("returns null for unsupported program regardless of reportType", () => {
    assert.equal(getReportPromptDocId("unknown", "monthly"), null);
    assert.equal(getReportPromptDocId("unknown", "term"), null);
  });

  it("returns null for null/undefined program", () => {
    assert.equal(getReportPromptDocId(null, "monthly"), null);
    assert.equal(getReportPromptDocId(undefined, "monthly"), null);
  });

  it("falls back to term for unknown reportType", () => {
    assert.equal(getReportPromptDocId("primary", "quarterly"), "report_primary");
  });
});

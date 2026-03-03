import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeReportConfig } from "../utils/reportHelpers.js";
import { REPORT_DEFAULTS } from "../config/reportConstants.js";

describe("mergeReportConfig", () => {
  it("returns REPORT_DEFAULTS when docData is null/undefined", () => {
    const result = mergeReportConfig(null, REPORT_DEFAULTS);
    assert.deepStrictEqual(result, {
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 4096,
      timezone: "Asia/Kolkata",
    });
  });

  it("returns REPORT_DEFAULTS when docData is empty object", () => {
    const result = mergeReportConfig({}, REPORT_DEFAULTS);
    assert.deepStrictEqual(result, {
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 4096,
      timezone: "Asia/Kolkata",
    });
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
    assert.equal(result.model, "gpt-4o");
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
    assert.equal(result.model, "gpt-4o");
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

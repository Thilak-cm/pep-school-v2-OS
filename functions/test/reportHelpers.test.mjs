import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultDateRange,
  parseReportResponse,
  getReportPromptDocId,
} from "../utils/reportHelpers.js";

describe("getDefaultDateRange", () => {
  it("returns Nov 1 of previous year when current month is before Nov", () => {
    // Simulate March 2026
    const now = new Date(2026, 2, 15); // March 15, 2026
    const { start, end } = getDefaultDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 10); // November (0-indexed)
    assert.equal(start.getDate(), 1);
    assert.equal(end.getTime(), now.getTime());
  });

  it("returns Nov 1 of current year when current month is Nov or later", () => {
    // Simulate December 2026
    const now = new Date(2026, 11, 10); // Dec 10, 2026
    const { start } = getDefaultDateRange(now);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 10); // November
    assert.equal(start.getDate(), 1);
  });

  it("returns Nov 1 of current year when current month is exactly Nov", () => {
    const now = new Date(2026, 10, 20); // Nov 20, 2026
    const { start } = getDefaultDateRange(now);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 10);
  });

  it("end date equals the provided now date", () => {
    const now = new Date(2026, 5, 1);
    const { end } = getDefaultDateRange(now);
    assert.equal(end.getTime(), now.getTime());
  });
});

describe("parseReportResponse", () => {
  it("extracts all fields from a well-formed JSON response", () => {
    const raw = JSON.stringify({
      reportText: "Aakash is a cheerful student...",
      sentimentScore: 4,
      areaBalanceScore: 5,
      missingInputFlags: [],
    });
    const result = parseReportResponse(raw);
    assert.equal(result.reportText, "Aakash is a cheerful student...");
    assert.equal(result.sentimentScore, 4);
    assert.equal(result.areaBalanceScore, 5);
    assert.deepEqual(result.missingInputFlags, []);
  });

  it("extracts missing input flags as string array", () => {
    const raw = JSON.stringify({
      reportText: "Some report text",
      sentimentScore: 3,
      areaBalanceScore: 3,
      missingInputFlags: ["Hindi inputs missing", "Kannada inputs missing"],
    });
    const result = parseReportResponse(raw);
    assert.deepEqual(result.missingInputFlags, [
      "Hindi inputs missing",
      "Kannada inputs missing",
    ]);
  });

  it("clamps sentimentScore to 1-5 range", () => {
    const raw = JSON.stringify({
      reportText: "text",
      sentimentScore: 7,
      areaBalanceScore: 0,
      missingInputFlags: [],
    });
    const result = parseReportResponse(raw);
    assert.equal(result.sentimentScore, 5);
    assert.equal(result.areaBalanceScore, 1);
  });

  it("defaults missing scores to null", () => {
    const raw = JSON.stringify({
      reportText: "text",
    });
    const result = parseReportResponse(raw);
    assert.equal(result.sentimentScore, null);
    assert.equal(result.areaBalanceScore, null);
    assert.deepEqual(result.missingInputFlags, []);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseReportResponse("not json at all"), {
      message: /Failed to parse report response/,
    });
  });

  it("throws when reportText is missing or empty", () => {
    const raw = JSON.stringify({
      sentimentScore: 3,
      areaBalanceScore: 4,
    });
    assert.throws(() => parseReportResponse(raw), {
      message: /reportText is missing/,
    });
  });

  it("handles reportText with newlines and markdown", () => {
    const text = "# Personal Development\n\nAakash is doing well.\n\n## Math\n\nHe shows potential.";
    const raw = JSON.stringify({
      reportText: text,
      sentimentScore: 4,
      areaBalanceScore: 4,
      missingInputFlags: [],
    });
    const result = parseReportResponse(raw);
    assert.equal(result.reportText, text);
  });
});

describe("getReportPromptDocId", () => {
  it("returns correct doc ID for adolescent program", () => {
    assert.equal(getReportPromptDocId("adolescent"), "report_adolescent");
  });

  it("returns correct doc ID for elementary program", () => {
    assert.equal(getReportPromptDocId("elementary"), "report_elementary");
  });

  it("returns null for unsupported program", () => {
    assert.equal(getReportPromptDocId("primary"), null);
  });

  it("returns null for undefined/empty input", () => {
    assert.equal(getReportPromptDocId(undefined), null);
    assert.equal(getReportPromptDocId(""), null);
    assert.equal(getReportPromptDocId(null), null);
  });
});

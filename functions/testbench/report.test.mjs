/**
 * PEP-328: Report generation test bench handler tests
 *
 * Tests the pure helper functions (prompt assembly, response parsing).
 * The main testBenchReport function requires Firestore + OpenRouter mocks
 * and is verified via manual e2e testing in the testbench UI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReportUserMessage, parseReportOutput } from "./report.js";

describe("buildReportUserMessage", () => {
  it("includes student context, date range, and notes", () => {
    const result = buildReportUserMessage({
      studentContext: { studentName: "Ava", dob: "2020-01-15", age: "6 years" },
      notes: [{ type: "text", text: "Worked with beads", observedAt: "2026-05-10" }],
      dateRange: { start: "2026-05-01", end: "2026-05-31" },
      reportType: "term",
    });
    assert.ok(result.includes("Ava"), "should include student name");
    assert.ok(result.includes("2026-05-01"), "should include start date");
    assert.ok(result.includes("2026-05-31"), "should include end date");
    assert.ok(result.includes("Worked with beads"), "should include observation text");
    assert.ok(result.includes("Educator Summary"), "should include term report label");
  });

  it("uses Monthly Baseline Report label for monthly type", () => {
    const result = buildReportUserMessage({
      studentContext: { studentName: "Ava", dob: "2020-01-15", age: "6 years" },
      notes: [],
      dateRange: { start: "2026-06-01", end: "2026-06-30" },
      reportType: "monthly",
    });
    assert.ok(result.includes("Monthly Baseline Report"), "should include monthly report label");
  });

  it("includes note count", () => {
    const notes = [
      { type: "text", text: "Note 1", observedAt: "2026-05-10" },
      { type: "text", text: "Note 2", observedAt: "2026-05-11" },
    ];
    const result = buildReportUserMessage({
      studentContext: { studentName: "Ava" },
      notes,
      dateRange: { start: "2026-05-01", end: "2026-05-31" },
      reportType: "term",
    });
    assert.ok(result.includes("2 observations"), "should include note count");
  });
});

describe("parseReportOutput", () => {
  it("extracts reportText from valid JSON response", () => {
    const raw = JSON.stringify({ reportText: "## PSED\nGreat progress." });
    const result = parseReportOutput(raw);
    assert.equal(result, "## PSED\nGreat progress.");
  });

  it("returns raw content if JSON parsing fails", () => {
    const raw = "## PSED\nGreat progress.";
    const result = parseReportOutput(raw);
    assert.equal(result, raw);
  });

  it("returns empty string for empty JSON reportText", () => {
    const raw = JSON.stringify({ reportText: "" });
    const result = parseReportOutput(raw);
    assert.equal(result, "");
  });
});

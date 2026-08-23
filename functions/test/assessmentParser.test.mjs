import test from "node:test";
import assert from "node:assert/strict";
import {buildStructuredAssessmentId, normalizeFilename, parseAssessmentMatrix} from "../assessments/parser.js";

const matrix = [
  ["Assessment Description", "Fractions on an A–UG scale"],
  ["Result 2", "Time taken"],
  ["Assessment Name", "Math - Fractions"],
  ["Date", "20/08/2026 - 22/08/2026"],
  ["Result 1", "Grade"],
  ["", ""],
  ["Name", "Result 1", "Result 2"],
  ["Ada Lovelace", "A\nB", "12min\n15min"],
];

test("parses metadata in any order and preserves exact result values", () => {
  const result = parseAssessmentMatrix(matrix, {worksheetName: "Assessment"});
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata.assessmentName, "Math - Fractions");
  assert.deepEqual(result.metadata.dateRange, {startDate: "2026-08-20", endDate: "2026-08-22"});
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].values["Result 2"], "12min");
});

test("skips multiple spacer rows before the data-table header", () => {
  const result = parseAssessmentMatrix([
    ["Assessment Name", "Fractions"],
    ["Date", "20/07/2026"],
    ["Result 1", "Grade"],
    ["Result 2", "Time taken"],
    ["Result 3", "Comment"],
    ["Assessment Description", "Numerators and denominators"],
    ["", ""],
    ["", ""],
    ["Name", "Result 1", "Result 2", "Result 3"],
    ["Student One", "15m", "no notes", "hi"],
  ]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].name, "Student One");
});

test("reports missing metadata and multiline mismatches", () => {
  const result = parseAssessmentMatrix([
    ["Assessment Name", "Math"], ["Date", "20/08/2026"], ["", ""],
    ["Name", "Result 1"], ["Ada", "A\nB"],
  ]);
  assert.ok(result.errors.some((error) => error.message.toLowerCase().includes("assessment description")));
  assert.equal(result.errors.some((error) => error.code === "MULTILINE_MISMATCH"), false);
  const mismatch = parseAssessmentMatrix([
    ["Assessment Name", "Math"], ["Assessment Description", "Grade"], ["Date", "20/08/2026"], ["Result 1", "Grade"], ["Result 2", "Comment"], ["", ""],
    ["Name", "Result 1", "Result 2"], ["Ada", "A\nB", "Needs practice"],
  ]);
  assert.ok(mismatch.errors.some((error) => error.code === "MULTILINE_MISMATCH"));
});

test("creates stable source helpers", () => {
  assert.equal(normalizeFilename(" Math Fractions (Final).XLSX"), "math-fractions-final");
  assert.equal(buildStructuredAssessmentId("src1", 8, 2), "assessment_structured_src1_8_2");
});

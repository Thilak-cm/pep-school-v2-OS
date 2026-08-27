import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildStructuredAssessmentId,
  normalizeFilename,
  parseAssessmentMatrix,
  worksheetToAssessmentMatrix,
} from "../assessments/parser.js";

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
  assert.deepEqual(result.rows[0].results[1], {
    resultNumber: 2,
    label: "Time taken",
    sourceValue: "12min",
    sourceCell: "C8",
    sourceFormula: null,
  });
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

test("preserves blank multiline positions and pads wholly blank result cells", () => {
  const result = parseAssessmentMatrix([
    ["Assessment Name", "Reading"],
    ["Assessment Description", "Fluency"],
    ["Date", "20/08/2026"],
    ["Result 1", "Level"],
    ["Result 2", "Comment"],
    ["", ""],
    ["Name", "Result 1", "Result 2"],
    ["Ada", "A\n\nB", ""],
  ]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(
    result.rows.map((row) => row.values),
    [
      {"Result 1": "A", "Result 2": ""},
      {"Result 1": "", "Result 2": ""},
      {"Result 1": "B", "Result 2": ""},
    ],
  );
});

test("retains formula provenance and blocks formulas without cached results", () => {
  const cell = (displayValue, sourceCell, formula = null, hasCachedValue = true) => ({
    __assessmentCell: true,
    displayValue,
    sourceCell,
    formula,
    hasCachedValue,
  });
  const base = [
    ["Assessment Name", "Math"],
    ["Assessment Description", "Fractions"],
    ["Date", "20/08/2026"],
    ["Result 1", "Score"],
    ["", ""],
    ["Name", "Result 1"],
  ];
  const cached = parseAssessmentMatrix([
    ...base,
    [cell("Ada", "A7"), cell("12", "B7", "SUM(C7:D7)", true)],
  ]);
  assert.equal(cached.errors.length, 0);
  assert.equal(cached.rows[0].results[0].sourceValue, "12");
  assert.equal(cached.rows[0].results[0].sourceFormula, "SUM(C7:D7)");

  const missing = parseAssessmentMatrix([
    ...base,
    [cell("Ada", "A7"), cell("", "B7", "SUM(C7:D7)", false)],
  ]);
  assert.ok(missing.errors.some((error) => error.code === "FORMULA_CACHE_MISSING"));
});

test("rejects blank Result definitions with an actionable cell error", () => {
  const result = parseAssessmentMatrix([
    ["Assessment Name", "Math"],
    ["Assessment Description", "Fractions"],
    ["Date", "20/08/2026"],
    ["Result 1", "   "],
    ["", ""],
    ["Name", "Result 1"],
    ["Ada", "12"],
  ]);

  assert.ok(result.errors.some((error) => (
    error.code === "INVALID_METADATA" &&
    error.cell === "B4" &&
    error.message.includes("needs a definition")
  )));
});

test("preserves absolute worksheet provenance when the used range is offset", () => {
  const worksheet = {
    "!ref": "C5:D11",
    C5: {t: "s", v: "Assessment Name", w: "Assessment Name"},
    D5: {t: "s", v: "Math", w: "Math"},
    C6: {t: "s", v: "Assessment Description", w: "Assessment Description"},
    D6: {t: "s", v: "Fractions", w: "Fractions"},
    C7: {t: "s", v: "Date", w: "Date"},
    D7: {t: "s", v: "20/08/2026", w: "20/08/2026"},
    C8: {t: "s", v: "Result 1", w: "Result 1"},
    D8: {t: "s", v: "Score", w: "Score"},
    C10: {t: "s", v: "Name", w: "Name"},
    D10: {t: "s", v: "Result 1", w: "Result 1"},
    C11: {t: "s", v: "Ada", w: "Ada"},
    D11: {t: "n", v: 12, w: "12"},
  };
  const xlsx = {
    utils: {
      decode_range: () => ({s: {r: 4, c: 2}, e: {r: 10, c: 3}}),
      encode_cell: ({r, c}) => `${String.fromCharCode(65 + c)}${r + 1}`,
      format_cell: (cell) => cell.w ?? cell.v,
    },
  };

  const result = parseAssessmentMatrix(
    worksheetToAssessmentMatrix(worksheet, xlsx),
  );

  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].sourceRow, 11);
  assert.equal(result.rows[0].nameSourceCell, "C11");
  assert.equal(result.rows[0].results[0].sourceCell, "D11");
});

test("maintained workbook parser preserves formulas and displayed values", () => {
  assert.equal(XLSX.version, "0.20.3");
  const worksheet = XLSX.utils.aoa_to_sheet([
    [{t: "n", v: 0.125, w: "12.5%", z: "0.0%", f: "1/8"}],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Assessment");
  const bytes = XLSX.write(workbook, {type: "buffer", bookType: "xlsx"});
  const reparsed = XLSX.read(bytes, {
    type: "buffer",
    cellFormula: true,
    cellNF: true,
    cellText: true,
  });
  const cell = reparsed.Sheets.Assessment.A1;

  assert.equal(cell.f, "1/8");
  assert.equal(cell.v, 0.125);
  assert.equal(cell.w, "12.5%");
});

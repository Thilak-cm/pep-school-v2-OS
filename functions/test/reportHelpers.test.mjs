import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultDateRange,
  parseReportResponse,
  getReportPromptDocId,
  formatCsvRow,
  parseCsv,
  serializeCsv,
  updateCsvContent,
  removeCsvRow,
  appendCsvContent,
} from "../utils/reportHelpers.js";
import {
  buildCsvFilename,
  buildArchiveCsvFilename,
} from "../config/reportConstants.js";

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
    assert.equal(getReportPromptDocId("unsupported_program"), null);
  });

  it("returns null for undefined/empty input", () => {
    assert.equal(getReportPromptDocId(undefined), null);
    assert.equal(getReportPromptDocId(""), null);
    assert.equal(getReportPromptDocId(null), null);
  });
});

describe("formatCsvRow", () => {
  it("formats a complete row with all fields including branch/program/classroom", () => {
    const row = formatCsvRow({
      studentName: "Aakash Mehta",
      branch: "HSR",
      program: "Adolescent",
      classroom: "All Stars",
      generatedAt: "2026-02-28T10:30:00.000Z",
      sentimentScore: 4,
      areaBalanceScore: 3,
      missingInputFlags: ["Hindi inputs missing"],
      docLink: "https://docs.google.com/document/d/abc123",
    });
    assert.equal(
      row,
      "Aakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,Hindi inputs missing,https://docs.google.com/document/d/abc123",
    );
  });

  it("handles null scores and missing branch/program/classroom", () => {
    const row = formatCsvRow({
      studentName: "Priya Sharma",
      generatedAt: "2026-02-28T10:30:00.000Z",
      sentimentScore: null,
      areaBalanceScore: null,
      missingInputFlags: [],
      docLink: "https://docs.google.com/document/d/xyz",
    });
    assert.equal(
      row,
      "Priya Sharma,,,,2026-02-28T10:30:00.000Z,,,,https://docs.google.com/document/d/xyz",
    );
  });

  it("joins multiple flags with semicolons", () => {
    const row = formatCsvRow({
      studentName: "Aakash Mehta",
      branch: "HSR",
      program: "Adolescent",
      classroom: "All Stars",
      generatedAt: "2026-02-28T10:30:00.000Z",
      sentimentScore: 3,
      areaBalanceScore: 2,
      missingInputFlags: ["Hindi inputs missing", "Kannada inputs missing"],
      docLink: "https://docs.google.com/document/d/abc",
    });
    assert.ok(row.includes("Hindi inputs missing; Kannada inputs missing"));
  });

  it("quotes student name containing commas", () => {
    const row = formatCsvRow({
      studentName: "Mehta, Aakash",
      branch: "HSR",
      program: "Adolescent",
      classroom: "All Stars",
      generatedAt: "2026-02-28T10:30:00.000Z",
      sentimentScore: 4,
      areaBalanceScore: 3,
      missingInputFlags: [],
      docLink: "https://docs.google.com/document/d/abc",
    });
    assert.ok(row.startsWith('"Mehta, Aakash"'));
  });
});

describe("parseCsv", () => {
  it("parses CSV with header and data rows", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const { headers, rows } = parseCsv(csv);
    assert.equal(headers.length, 9);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], "Aakash Mehta");
    assert.equal(rows[0][1], "HSR");
  });

  it("returns empty rows for header-only CSV", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link";
    const { headers, rows } = parseCsv(csv);
    assert.equal(headers.length, 9);
    assert.equal(rows.length, 0);
  });

  it("returns empty result for empty string", () => {
    const { headers, rows } = parseCsv("");
    assert.equal(headers.length, 0);
    assert.equal(rows.length, 0);
  });

  it("handles quoted fields with commas", () => {
    const csv = 'Child Name,Score\n"Mehta, Aakash",4';
    const { rows } = parseCsv(csv);
    assert.equal(rows[0][0], "Mehta, Aakash");
    assert.equal(rows[0][1], "4");
  });
});

describe("serializeCsv", () => {
  it("serializes headers and rows", () => {
    const headers = ["Name", "Score"];
    const rows = [["Aakash", "4"], ["Priya", "5"]];
    const result = serializeCsv(headers, rows);
    assert.equal(result, "Name,Score\nAakash,4\nPriya,5");
  });

  it("handles empty rows", () => {
    const headers = ["Name", "Score"];
    const result = serializeCsv(headers, []);
    assert.equal(result, "Name,Score");
  });
});

describe("updateCsvContent", () => {
  const CSV_HEADERS = [
    "Child Name",
    "Branch",
    "Program",
    "Classroom",
    "Generation Date",
    "Sentiment Score",
    "Area Balance Score",
    "Missing Input Flags",
    "Google Doc Link",
  ];

  it("creates new CSV with headers when existing is empty", () => {
    const newRow = "Aakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const result = updateCsvContent("", newRow, "Aakash Mehta", CSV_HEADERS);
    const lines = result.split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], CSV_HEADERS.join(","));
    assert.equal(lines[1], newRow);
  });

  it("appends row for a new student", () => {
    const existing = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const newRow = "Priya Sharma,HSR,Adolescent,All Stars,2026-02-28T11:00:00.000Z,5,4,,https://docs.google.com/document/d/xyz";
    const result = updateCsvContent(existing, newRow, "Priya Sharma", CSV_HEADERS);
    const lines = result.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[2].includes("Priya Sharma"));
  });

  it("updates existing row for same student", () => {
    const existing = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const newRow = "Aakash Mehta,HSR,Adolescent,All Stars,2026-02-28T12:00:00.000Z,5,4,,https://docs.google.com/document/d/def";
    const result = updateCsvContent(existing, newRow, "Aakash Mehta", CSV_HEADERS);
    const lines = result.split("\n");
    assert.equal(lines.length, 2); // header + 1 data row (updated, not appended)
    assert.ok(lines[1].includes("def")); // new doc link
    assert.ok(!lines[1].includes("abc")); // old doc link gone
  });
});

describe("removeCsvRow", () => {
  const CSV_HEADERS = [
    "Child Name",
    "Branch",
    "Program",
    "Classroom",
    "Generation Date",
    "Sentiment Score",
    "Area Balance Score",
    "Missing Input Flags",
    "Google Doc Link",
  ];

  it("removes row matching student name", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc\nPriya Sharma,HSR,Adolescent,All Stars,2026-02-28T11:00:00.000Z,5,4,,https://docs.google.com/document/d/xyz";
    const result = removeCsvRow(csv, "Aakash Mehta", CSV_HEADERS);
    const { rows } = parseCsv(result);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], "Priya Sharma");
  });

  it("returns header-only CSV when last row is removed", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const result = removeCsvRow(csv, "Aakash Mehta", CSV_HEADERS);
    const { headers, rows } = parseCsv(result);
    assert.equal(headers.length, 9);
    assert.equal(rows.length, 0);
  });

  it("returns CSV unchanged when student name not found", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const result = removeCsvRow(csv, "Unknown Student", CSV_HEADERS);
    const { rows } = parseCsv(result);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], "Aakash Mehta");
  });

  it("returns empty string for empty CSV input", () => {
    const result = removeCsvRow("", "Aakash Mehta", CSV_HEADERS);
    assert.equal(result, "");
  });

  it("matches student name case-insensitively", () => {
    const csv = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const result = removeCsvRow(csv, "aakash mehta", CSV_HEADERS);
    const { rows } = parseCsv(result);
    assert.equal(rows.length, 0);
  });
});

// ── buildCsvFilename / buildArchiveCsvFilename (PEP-83) ──

describe("buildCsvFilename", () => {
  it("prepends classroom name and hardcoded term to summary CSV filename", () => {
    assert.equal(
      buildCsvFilename("All Stars"),
      "All Stars | March 2026 | Report Consolidation Summary.csv",
    );
  });

  it("handles classroom names with special characters", () => {
    assert.equal(
      buildCsvFilename("Room A & B"),
      "Room A & B | March 2026 | Report Consolidation Summary.csv",
    );
  });
});

describe("buildArchiveCsvFilename", () => {
  it("prepends classroom name and hardcoded term to archive CSV filename", () => {
    assert.equal(
      buildArchiveCsvFilename("All Stars"),
      "All Stars | March 2026 | Report Consolidation Summary Archive.csv",
    );
  });
});

// ── appendCsvContent (PEP-83) ──

describe("appendCsvContent", () => {
  const CSV_HEADERS = [
    "Child Name",
    "Branch",
    "Program",
    "Classroom",
    "Generation Date",
    "Sentiment Score",
    "Area Balance Score",
    "Missing Input Flags",
    "Google Doc Link",
  ];

  it("creates new CSV with headers when existing is empty", () => {
    const newRow = "Aakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const result = appendCsvContent("", newRow, CSV_HEADERS);
    const lines = result.split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], CSV_HEADERS.join(","));
    assert.equal(lines[1], newRow);
  });

  it("always appends — never replaces existing row for same student", () => {
    const existing = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const newRow = "Aakash Mehta,HSR,Adolescent,All Stars,2026-03-01T12:00:00.000Z,5,4,,https://docs.google.com/document/d/def";
    const result = appendCsvContent(existing, newRow, CSV_HEADERS);
    const { rows } = parseCsv(result);
    assert.equal(rows.length, 2, "should have 2 rows for same student — append, not replace");
    assert.ok(rows[0][8].includes("abc"), "first row keeps original doc link");
    assert.ok(rows[1][8].includes("def"), "second row has new doc link");
  });

  it("appends row for a different student", () => {
    const existing = "Child Name,Branch,Program,Classroom,Generation Date,Sentiment Score,Area Balance Score,Missing Input Flags,Google Doc Link\nAakash Mehta,HSR,Adolescent,All Stars,2026-02-28T10:30:00.000Z,4,3,,https://docs.google.com/document/d/abc";
    const newRow = "Priya Sharma,HSR,Adolescent,All Stars,2026-03-01T12:00:00.000Z,5,4,,https://docs.google.com/document/d/xyz";
    const result = appendCsvContent(existing, newRow, CSV_HEADERS);
    const { rows } = parseCsv(result);
    assert.equal(rows.length, 2);
  });
});


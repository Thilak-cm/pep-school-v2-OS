import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStudentName,
  capitalize,
  buildReportDocTitle,
} from "../utils/driveHelpers.js";

describe("resolveStudentName", () => {
  it("returns displayName when present", () => {
    assert.equal(
      resolveStudentName({ displayName: "Aakash Mehta", firstName: "Aakash", lastName: "Mehta" }),
      "Aakash Mehta",
    );
  });

  it("falls back to name when displayName is missing", () => {
    assert.equal(
      resolveStudentName({ name: "Priya Sharma" }),
      "Priya Sharma",
    );
  });

  it("falls back to firstName + lastName when others are missing", () => {
    assert.equal(
      resolveStudentName({ firstName: "Aakash", lastName: "Mehta" }),
      "Aakash Mehta",
    );
  });

  it("uses firstName alone when lastName is missing", () => {
    assert.equal(
      resolveStudentName({ firstName: "Aakash" }),
      "Aakash",
    );
  });

  it("returns Unknown Student for null/undefined", () => {
    assert.equal(resolveStudentName(null), "Unknown Student");
    assert.equal(resolveStudentName(undefined), "Unknown Student");
  });

  it("returns Unknown Student when all name fields are empty", () => {
    assert.equal(resolveStudentName({}), "Unknown Student");
  });
});

describe("capitalize", () => {
  it("capitalizes first letter", () => {
    assert.equal(capitalize("adolescent"), "Adolescent");
  });

  it("handles already capitalized", () => {
    assert.equal(capitalize("HSR"), "HSR");
  });

  it("trims whitespace", () => {
    assert.equal(capitalize("  primary  "), "Primary");
  });

  it("handles empty/null", () => {
    assert.equal(capitalize(""), "");
    assert.equal(capitalize(null), "");
  });
});

describe("buildReportDocTitle", () => {
  it("includes date for first report (count=0)", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-02-28T10:00:00.000Z", 0),
      "Aakash Mehta — Progress Report (2026-02-28)",
    );
  });

  it("includes version and date for subsequent reports", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-03-15T10:00:00.000Z", 1),
      "Aakash Mehta — Progress Report v2 (2026-03-15)",
    );
  });

  it("handles higher version counts", () => {
    assert.equal(
      buildReportDocTitle("Priya Sharma", "2026-06-01T00:00:00.000Z", 3),
      "Priya Sharma — Progress Report v4 (2026-06-01)",
    );
  });

  it("uses current date when generatedAt is null", () => {
    const title = buildReportDocTitle("Aakash Mehta", null);
    const todayStr = new Date().toISOString().split("T")[0];
    assert.equal(title, `Aakash Mehta — Progress Report (${todayStr})`);
  });

  it("trims student name", () => {
    assert.equal(
      buildReportDocTitle("  Aakash Mehta  ", "2026-02-28T10:00:00.000Z", 0),
      "Aakash Mehta — Progress Report (2026-02-28)",
    );
  });
});

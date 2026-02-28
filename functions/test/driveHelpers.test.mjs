import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildClassroomFolderName,
  buildReportDocTitle,
} from "../utils/driveHelpers.js";

describe("buildClassroomFolderName", () => {
  it("combines classroom name and program", () => {
    assert.equal(
      buildClassroomFolderName("Room 3", "adolescent"),
      "Room 3 — Adolescent",
    );
  });

  it("capitalises program name", () => {
    assert.equal(
      buildClassroomFolderName("Sunrise", "elementary"),
      "Sunrise — Elementary",
    );
  });

  it("handles missing program gracefully", () => {
    assert.equal(
      buildClassroomFolderName("Room 3", null),
      "Room 3",
    );
  });

  it("handles missing program as empty string", () => {
    assert.equal(
      buildClassroomFolderName("Room 3", ""),
      "Room 3",
    );
  });

  it("trims whitespace from inputs", () => {
    assert.equal(
      buildClassroomFolderName("  Room 3  ", " adolescent "),
      "Room 3 — Adolescent",
    );
  });
});

describe("buildReportDocTitle", () => {
  it("returns base title for first report (count=0)", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", 0),
      "Aakash Mehta — Progress Report",
    );
  });

  it("returns base title for count=1 (no version suffix for first)", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", 1),
      "Aakash Mehta — Progress Report v2",
    );
  });

  it("returns versioned title for subsequent reports", () => {
    assert.equal(
      buildReportDocTitle("Priya Sharma", 3),
      "Priya Sharma — Progress Report v4",
    );
  });

  it("handles count=0 as default when not provided", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta"),
      "Aakash Mehta — Progress Report",
    );
  });

  it("trims student name", () => {
    assert.equal(
      buildReportDocTitle("  Aakash Mehta  ", 0),
      "Aakash Mehta — Progress Report",
    );
  });
});

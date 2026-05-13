import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReadinessArchive } from "../utils/reportHelpers.js";

describe("buildReadinessArchive", () => {
  const okDoc = {
    sentimentScore: 4,
    areaBalanceScore: 3,
    missingInputFlags: ["Hindi inputs missing"],
    noteCount: 32,
    noteCountAtCheck: 32,
    checkedAt: new Date("2026-05-10T10:00:00Z"),
    dateRangeStart: new Date("2025-11-01T00:00:00Z"),
    dateRangeEnd: new Date("2026-05-10T10:00:00Z"),
    programId: "elementary",
    model: "gpt-5.4-mini",
    status: "ok",
    generatedBy: "uid-abc",
    generatedByName: "Jane Doe",
  };

  it("returns full snapshot with archivedAt and reason for status:ok doc", () => {
    const result = buildReadinessArchive(okDoc, "Readiness recheck by Jane Doe");
    assert.ok(result, "should return a non-null archive");
    assert.equal(result.sentimentScore, 4);
    assert.equal(result.areaBalanceScore, 3);
    assert.deepEqual(result.missingInputFlags, ["Hindi inputs missing"]);
    assert.equal(result.noteCount, 32);
    assert.equal(result.programId, "elementary");
    assert.equal(result.model, "gpt-5.4-mini");
    assert.equal(result.status, "ok");
    assert.equal(result.generatedBy, "uid-abc");
    assert.equal(result.generatedByName, "Jane Doe");
    assert.ok(result.archivedAt instanceof Date, "archivedAt should be a Date");
    assert.equal(result.reason, "Readiness recheck by Jane Doe");
  });

  it("preserves all original fields including timestamps", () => {
    const result = buildReadinessArchive(okDoc, "test reason");
    assert.deepEqual(result.checkedAt, okDoc.checkedAt);
    assert.deepEqual(result.dateRangeStart, okDoc.dateRangeStart);
    assert.deepEqual(result.dateRangeEnd, okDoc.dateRangeEnd);
    assert.equal(result.noteCountAtCheck, 32);
  });

  it("returns null for status:no_notes doc", () => {
    const noNotesDoc = { ...okDoc, status: "no_notes" };
    const result = buildReadinessArchive(noNotesDoc, "recheck");
    assert.equal(result, null);
  });

  it("returns null when existing doc is null", () => {
    const result = buildReadinessArchive(null, "recheck");
    assert.equal(result, null);
  });

  it("returns null when existing doc is undefined", () => {
    const result = buildReadinessArchive(undefined, "recheck");
    assert.equal(result, null);
  });

  it("uses default reason when name is not in reason string", () => {
    const result = buildReadinessArchive(okDoc, "Readiness recheck");
    assert.equal(result.reason, "Readiness recheck");
    assert.ok(result.archivedAt instanceof Date);
  });
});

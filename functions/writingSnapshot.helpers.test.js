import test from "node:test";
import assert from "node:assert/strict";

import {
  filterWritingSamples,
  formatWritingSampleLabel,
  determineSnapshotStatus,
  parseWritingSnapshotResponse,
} from "./writingSnapshot.helpers.js";

// --- filterWritingSamples ---

const feb1 = new Date("2026-01-31T18:30:00Z");  // Feb 1 00:00 IST
const mar1 = new Date("2026-02-28T18:30:00Z");   // Mar 1 00:00 IST

function makeDoc(overrides = {}) {
  return {
    id: overrides.id || "media_1",
    mediaKind: "photo",
    handwritten: true,
    copied: false,
    observedAt: new Date("2026-02-10T12:00:00Z"),
    ...overrides,
  };
}

test("filterWritingSamples: returns only handwritten=true docs", () => {
  const docs = [
    makeDoc({ id: "hw", handwritten: true }),
    makeDoc({ id: "not_hw", handwritten: false }),
    makeDoc({ id: "missing_hw", handwritten: undefined }),
  ];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "hw");
});

test("filterWritingSamples: excludes docs outside the month window", () => {
  const docs = [
    makeDoc({ id: "before", observedAt: new Date("2026-01-20T12:00:00Z") }),
    makeDoc({ id: "inside", observedAt: new Date("2026-02-15T12:00:00Z") }),
    makeDoc({ id: "after", observedAt: new Date("2026-03-05T12:00:00Z") }),
  ];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "inside");
});

test("filterWritingSamples: includes both copied and non-copied docs", () => {
  const docs = [
    makeDoc({ id: "orig", copied: false }),
    makeDoc({ id: "copy", copied: true }),
  ];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 2);
});

test("filterWritingSamples: excludes non-photo media kinds", () => {
  const docs = [
    makeDoc({ id: "photo", mediaKind: "photo" }),
    makeDoc({ id: "pdf", mediaKind: "pdf" }),
    makeDoc({ id: "video", mediaKind: "video" }),
  ];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "photo");
});

test("filterWritingSamples: sorts by observedAt ascending (oldest first)", () => {
  const docs = [
    makeDoc({ id: "late", observedAt: new Date("2026-02-20T12:00:00Z") }),
    makeDoc({ id: "early", observedAt: new Date("2026-02-05T12:00:00Z") }),
    makeDoc({ id: "mid", observedAt: new Date("2026-02-12T12:00:00Z") }),
  ];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.deepEqual(result.map((d) => d.id), ["early", "mid", "late"]);
});

test("filterWritingSamples: handles Firestore-like toDate() timestamps", () => {
  const firestoreTs = {
    toDate: () => new Date("2026-02-10T12:00:00Z"),
  };
  const docs = [makeDoc({ id: "fs", observedAt: firestoreTs })];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 1);
});

test("filterWritingSamples: boundary — doc at exact window start is included", () => {
  const docs = [makeDoc({ id: "boundary", observedAt: feb1 })];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 1);
});

test("filterWritingSamples: boundary — doc at exact window end is excluded", () => {
  const docs = [makeDoc({ id: "boundary", observedAt: mar1 })];
  const result = filterWritingSamples(docs, feb1, mar1);
  assert.equal(result.length, 0);
});

// --- formatWritingSampleLabel ---

test("formatWritingSampleLabel: formats original sample correctly", () => {
  const doc = makeDoc({ observedAt: new Date("2026-02-10T12:00:00Z"), copied: false });
  const label = formatWritingSampleLabel(doc, 1);
  assert.equal(label, "Image 1: 2026-02-10, original");
});

test("formatWritingSampleLabel: formats copied sample correctly", () => {
  const doc = makeDoc({ observedAt: new Date("2026-02-10T12:00:00Z"), copied: true });
  const label = formatWritingSampleLabel(doc, 2);
  assert.equal(label, "Image 2: 2026-02-10, copied");
});

test("formatWritingSampleLabel: includes teacher comment when present", () => {
  const doc = makeDoc({
    observedAt: new Date("2026-02-10T12:00:00Z"),
    teacherComment: "Good effort",
    copied: false,
  });
  const label = formatWritingSampleLabel(doc, 3);
  assert.equal(label, "Image 3: 2026-02-10, original — \"Good effort\"");
});

test("formatWritingSampleLabel: handles Firestore timestamp", () => {
  const doc = makeDoc({
    observedAt: { toDate: () => new Date("2026-02-15T10:00:00Z") },
    copied: true,
  });
  const label = formatWritingSampleLabel(doc, 1);
  assert.equal(label, "Image 1: 2026-02-15, copied");
});

// --- determineSnapshotStatus ---

test("determineSnapshotStatus: no_samples when count is 0", () => {
  assert.equal(determineSnapshotStatus(0), "no_samples");
});

test("determineSnapshotStatus: insufficient_samples when below minimum", () => {
  assert.equal(determineSnapshotStatus(1), "insufficient_samples");
  assert.equal(determineSnapshotStatus(2), "insufficient_samples");
});

test("determineSnapshotStatus: ok when at or above minimum", () => {
  assert.equal(determineSnapshotStatus(3), "ok");
  assert.equal(determineSnapshotStatus(10), "ok");
});

test("determineSnapshotStatus: respects custom minSamples", () => {
  assert.equal(determineSnapshotStatus(4, 5), "insufficient_samples");
  assert.equal(determineSnapshotStatus(5, 5), "ok");
});

// --- parseWritingSnapshotResponse ---

test("parseWritingSnapshotResponse: parses valid JSON with all fields", () => {
  const raw = JSON.stringify({
    analysis: "The student shows progress.",
    stage: "letter-forming",
    strengths: ["grip control", "letter spacing"],
    areasForGrowth: ["letter size consistency"],
  });
  const result = parseWritingSnapshotResponse(raw);
  assert.equal(result.analysis, "The student shows progress.");
  assert.equal(result.stage, "letter-forming");
  assert.deepEqual(result.strengths, ["grip control", "letter spacing"]);
  assert.deepEqual(result.areasForGrowth, ["letter size consistency"]);
});

test("parseWritingSnapshotResponse: returns defaults for invalid JSON", () => {
  const result = parseWritingSnapshotResponse("not json at all");
  assert.equal(result.analysis, "");
  assert.equal(result.stage, null);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.areasForGrowth, []);
});

test("parseWritingSnapshotResponse: nullifies unknown stage values", () => {
  const raw = JSON.stringify({
    analysis: "Summary",
    stage: "made-up-stage",
    strengths: [],
    areasForGrowth: [],
  });
  const result = parseWritingSnapshotResponse(raw);
  assert.equal(result.stage, null);
});

test("parseWritingSnapshotResponse: handles missing fields gracefully", () => {
  const raw = JSON.stringify({ analysis: "Just analysis" });
  const result = parseWritingSnapshotResponse(raw);
  assert.equal(result.analysis, "Just analysis");
  assert.equal(result.stage, null);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.areasForGrowth, []);
});

test("parseWritingSnapshotResponse: filters non-string entries from arrays", () => {
  const raw = JSON.stringify({
    analysis: "Test",
    stage: "scribbling",
    strengths: ["real", 123, null, "also real"],
    areasForGrowth: [true, "valid"],
  });
  const result = parseWritingSnapshotResponse(raw);
  assert.deepEqual(result.strengths, ["real", "also real"]);
  assert.deepEqual(result.areasForGrowth, ["valid"]);
});

test("parseWritingSnapshotResponse: validates all valid stage values", () => {
  const stages = [
    "scribbling", "pre-letter", "letter-forming", "letter-naming",
    "early-phonetic", "phonetic", "transitional", "conventional",
  ];
  for (const stage of stages) {
    const raw = JSON.stringify({ analysis: "", stage, strengths: [], areasForGrowth: [] });
    const result = parseWritingSnapshotResponse(raw);
    assert.equal(result.stage, stage, `stage "${stage}" should be valid`);
  }
});

test("parseWritingSnapshotResponse: null stage when stage is null in JSON", () => {
  const raw = JSON.stringify({ analysis: "", stage: null, strengths: [], areasForGrowth: [] });
  const result = parseWritingSnapshotResponse(raw);
  assert.equal(result.stage, null);
});

import test from "node:test";
import assert from "node:assert/strict";

import {isGenericObservation, normalizeTimestampValue, chooseObservationTimestamp} from "./studentHelpers.js";

test("generic AI observation readers exclude both assessment subtypes", () => {
  assert.equal(isGenericObservation({type: "text", text: "work"}), true);
  assert.equal(isGenericObservation({type: "lesson"}), true);
  assert.equal(isGenericObservation({type: "assessment", assessmentKind: "structured"}), false);
  assert.equal(isGenericObservation({type: "assessment", assessmentKind: "medical", uploadStatus: "ready"}), false);
  assert.equal(isGenericObservation({assessmentKind: "medical"}), false);
});

// ---------------------------------------------------------------------------
// normalizeTimestampValue - critical for delta cutoff comparisons (#314)
// ---------------------------------------------------------------------------

test("normalizeTimestampValue handles Firestore Timestamp (toDate method)", () => {
  const firestoreTs = { toDate: () => new Date("2026-10-01T00:00:00Z") };
  const result = normalizeTimestampValue(firestoreTs);
  assert.ok(result instanceof Date);
  assert.equal(result.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("normalizeTimestampValue handles Firestore Timestamp (seconds field)", () => {
  const ts = { seconds: 1790985600 }; // 2026-10-01T00:00:00Z
  const result = normalizeTimestampValue(ts);
  assert.ok(result instanceof Date);
  assert.equal(result.getTime(), 1790985600 * 1000);
});

test("normalizeTimestampValue passes through JS Date objects", () => {
  const date = new Date("2026-10-01T00:00:00Z");
  const result = normalizeTimestampValue(date);
  assert.equal(result, date);
});

test("normalizeTimestampValue returns null for falsy inputs", () => {
  assert.equal(normalizeTimestampValue(null), null);
  assert.equal(normalizeTimestampValue(undefined), null);
  assert.equal(normalizeTimestampValue(0), null);
  assert.equal(normalizeTimestampValue(""), null);
});

test("normalizeTimestampValue handles Firestore Timestamp with seconds=0 (epoch)", () => {
  const ts = { seconds: 0 };
  const result = normalizeTimestampValue(ts);
  assert.ok(result instanceof Date);
  assert.equal(result.getTime(), 0);
});

test("normalizeTimestampValue returns null for unrecognized types", () => {
  assert.equal(normalizeTimestampValue("2026-10-01"), null);
  assert.equal(normalizeTimestampValue(12345), null);
});

// ---------------------------------------------------------------------------
// chooseObservationTimestamp - picks best timestamp for cutoff filtering (#314)
// ---------------------------------------------------------------------------

test("chooseObservationTimestamp prefers observedAt over createdAt", () => {
  const obs = {
    observedAt: { toDate: () => new Date("2026-10-01") },
    createdAt: { toDate: () => new Date("2026-09-01") },
  };
  const result = chooseObservationTimestamp(obs);
  assert.equal(result.toISOString().slice(0, 10), "2026-10-01");
});

test("chooseObservationTimestamp falls back to createdAt when observedAt missing", () => {
  const obs = { createdAt: { toDate: () => new Date("2026-09-15") } };
  const result = chooseObservationTimestamp(obs);
  assert.equal(result.toISOString().slice(0, 10), "2026-09-15");
});

test("chooseObservationTimestamp returns null when both fields missing", () => {
  assert.equal(chooseObservationTimestamp({}), null);
  assert.equal(chooseObservationTimestamp({ type: "text" }), null);
});

test("chooseObservationTimestamp returns null for null/undefined input", () => {
  assert.equal(chooseObservationTimestamp(null), null);
  assert.equal(chooseObservationTimestamp(undefined), null);
});

// ---------------------------------------------------------------------------
// Delta cutoff Date comparison correctness (#314)
// Firestore queries use Date objects as cutoffs; the in-memory filter in
// fetchStudentNotesForWindow uses `ts >= cutoffDate` where both are Date objects
// after normalizeTimestampValue. These tests verify the comparison works
// correctly with normalized values from different source types.
// ---------------------------------------------------------------------------

test("normalized Firestore Timestamp is comparable with Date via >=", () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");
  const firestoreTs = { toDate: () => new Date("2026-10-15T00:00:00Z") };
  const normalized = normalizeTimestampValue(firestoreTs);
  assert.ok(normalized >= cutoff, "observation after cutoff should pass");
});

test("normalized Firestore Timestamp before cutoff fails >= check", () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");
  const firestoreTs = { toDate: () => new Date("2026-09-15T00:00:00Z") };
  const normalized = normalizeTimestampValue(firestoreTs);
  assert.ok(!(normalized >= cutoff), "observation before cutoff should be filtered out");
});

test("exact cutoff boundary is inclusive (>=)", () => {
  const cutoff = new Date("2026-10-01T00:00:00Z");
  const firestoreTs = { toDate: () => new Date("2026-10-01T00:00:00Z") };
  const normalized = normalizeTimestampValue(firestoreTs);
  assert.ok(normalized >= cutoff, "observation at exact cutoff should pass (inclusive)");
});

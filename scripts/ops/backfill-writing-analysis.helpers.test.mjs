/**
 * Unit tests for backfill-writing-analysis helpers (#281).
 * Run: node --test scripts/ops/backfill-writing-analysis.helpers.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getSimulatedRunTime,
  filterMediaForWeek,
  deriveHistoryKey,
  planHistoryRekey,
  docsDeepEqual,
  buildBackfillAnalysisDoc,
  nextTargetWeek,
  getBlockedStudents,
  planLumpCleanup,
  verifyWeekReport,
  TARGET_WEEKS,
} from "./backfill-writing-analysis.helpers.mjs";

// Lazy-import weekKey for roundtrip verification
import { getIstIsoWeekKey } from "../../functions/utils/weekKey.js";

// ---------------------------------------------------------------------------
// getSimulatedRunTime
// ---------------------------------------------------------------------------

describe("getSimulatedRunTime", () => {
  it("returns Sunday 00:30 IST (Saturday 19:00 UTC) for the given week", () => {
    // W30 of 2026: Mon Jul 20 - Sun Jul 26
    // Sunday 00:30 IST = Saturday 19:00 UTC = 2026-07-25T19:00:00.000Z
    const t = getSimulatedRunTime("2026-W30");
    assert.equal(t.toISOString(), "2026-07-25T19:00:00.000Z");
  });

  it("roundtrips through getIstIsoWeekKey for W30-W36", () => {
    for (const wk of TARGET_WEEKS) {
      const t = getSimulatedRunTime(wk);
      // At 00:30 IST Sunday, getIstIsoWeekKey should return the same week
      // because Sunday is the last day of the ISO week
      assert.equal(getIstIsoWeekKey(t), wk, `roundtrip failed for ${wk}`);
    }
  });

  it("W36 = 2026-09-05T19:00:00.000Z (Sun Sep 6 00:30 IST)", () => {
    const t = getSimulatedRunTime("2026-W36");
    assert.equal(t.toISOString(), "2026-09-05T19:00:00.000Z");
  });

  it("throws on invalid week key", () => {
    assert.throws(() => getSimulatedRunTime("invalid"), /Invalid week key/);
  });
});

// ---------------------------------------------------------------------------
// filterMediaForWeek
// ---------------------------------------------------------------------------

describe("filterMediaForWeek", () => {
  const cutoff = new Date("2026-07-25T19:00:00.000Z"); // W30 Sunday 00:30 IST

  it("includes docs before cutoff", () => {
    const docs = [
      { id: "a", observedAt: new Date("2026-07-20T10:00:00.000Z") },
      { id: "b", observedAt: new Date("2026-07-25T18:59:59.999Z") },
    ];
    assert.equal(filterMediaForWeek(docs, cutoff).length, 2);
  });

  it("excludes docs at or after cutoff", () => {
    const docs = [
      { id: "a", observedAt: new Date("2026-07-25T19:00:00.000Z") }, // exactly at cutoff
      { id: "b", observedAt: new Date("2026-07-26T00:00:00.000Z") }, // after
    ];
    assert.equal(filterMediaForWeek(docs, cutoff).length, 0);
  });

  it("returns empty for empty input", () => {
    assert.equal(filterMediaForWeek([], cutoff).length, 0);
  });
});

// ---------------------------------------------------------------------------
// deriveHistoryKey
// ---------------------------------------------------------------------------

describe("deriveHistoryKey", () => {
  it("uses periodKey when present", () => {
    assert.equal(deriveHistoryKey({ periodKey: "2026-W29" }), "2026-W29");
  });

  it("falls back to getIstIsoWeekKey(generatedAt) when periodKey absent", () => {
    // 2026-07-19 is a Saturday in W29
    const generatedAt = new Date("2026-07-19T00:35:00.000Z");
    assert.equal(deriveHistoryKey({ generatedAt }), "2026-W29");
  });

  it("handles Firestore-style Timestamp objects with toDate()", () => {
    const fakeTs = { toDate: () => new Date("2026-07-19T00:35:00.000Z") };
    assert.equal(deriveHistoryKey({ generatedAt: fakeTs }), "2026-W29");
  });

  it("throws when neither periodKey nor generatedAt present", () => {
    assert.throws(() => deriveHistoryKey({}), /Cannot derive/);
  });
});

// ---------------------------------------------------------------------------
// planHistoryRekey
// ---------------------------------------------------------------------------

describe("planHistoryRekey", () => {
  it("maps ISO-timestamp IDs to week keys", () => {
    const entries = [
      { id: "2026-07-19T00-35-12-345Z", data: { generatedAt: new Date("2026-07-19T00:35:12.345Z") } },
    ];
    const plan = planHistoryRekey(entries);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].oldId, "2026-07-19T00-35-12-345Z");
    assert.equal(plan[0].newId, "2026-W29");
  });

  it("skips entries already keyed correctly", () => {
    const entries = [
      { id: "2026-W29", data: { periodKey: "2026-W29" } },
    ];
    const plan = planHistoryRekey(entries);
    assert.equal(plan.length, 0);
  });

  it("throws on collision (two entries map to same week key)", () => {
    const entries = [
      { id: "2026-07-18T00-35-12-345Z", data: { generatedAt: new Date("2026-07-18T00:35:12.345Z") } },
      { id: "2026-07-19T10-00-00-000Z", data: { generatedAt: new Date("2026-07-19T10:00:00.000Z") } },
    ];
    // Both are W29 (Jul 18 Sat and Jul 19 Sun are in the same ISO week)
    assert.throws(() => planHistoryRekey(entries), /collision/i);
  });
});

// ---------------------------------------------------------------------------
// docsDeepEqual
// ---------------------------------------------------------------------------

describe("docsDeepEqual", () => {
  it("returns true for identical plain objects", () => {
    const a = { narrative: "test", score: 3, nested: { x: 1 } };
    const b = { narrative: "test", score: 3, nested: { x: 1 } };
    assert.ok(docsDeepEqual(a, b));
  });

  it("returns false for differing values", () => {
    assert.ok(!docsDeepEqual({ a: 1 }, { a: 2 }));
  });

  it("handles Firestore Timestamp-like objects via toDate()", () => {
    const ts = new Date("2026-07-19T00:35:00.000Z");
    const a = { generatedAt: { toDate: () => ts, _seconds: 123, _nanoseconds: 0 } };
    const b = { generatedAt: { toDate: () => ts, _seconds: 123, _nanoseconds: 0 } };
    assert.ok(docsDeepEqual(a, b));
  });

  it("returns false when keys differ", () => {
    assert.ok(!docsDeepEqual({ a: 1, b: 2 }, { a: 1 }));
  });
});

// ---------------------------------------------------------------------------
// buildBackfillAnalysisDoc
// ---------------------------------------------------------------------------

describe("buildBackfillAnalysisDoc", () => {
  const parsed = { narrative: "Good progress", dimensionRatings: {}, improvements: [], concerns: [], recommendations: [] };
  const ctx = {
    mediaDocs: [
      { id: "m1", copied: false },
      { id: "m2", copied: true },
      { id: "m3", copied: false },
    ],
    studentAge: { years: 5, months: 3 },
    model: "openai/gpt-5.4-mini",
    programId: "primary",
    classroomId: "allstars",
    weekKey: "2026-W31",
  };

  it("includes backfilled: true and overridden periodKey", () => {
    const doc = buildBackfillAnalysisDoc(parsed, ctx);
    assert.equal(doc.backfilled, true);
    assert.equal(doc.periodKey, "2026-W31");
  });

  it("has honest generatedAt (a Date, not fabricated)", () => {
    const doc = buildBackfillAnalysisDoc(parsed, ctx);
    assert.ok(doc.generatedAt instanceof Date);
    // Should be approximately "now"
    assert.ok(Date.now() - doc.generatedAt.getTime() < 5000);
  });

  it("matches production doc shape (sampleCount, copiedCount, sourceMediaIds, status)", () => {
    const doc = buildBackfillAnalysisDoc(parsed, ctx);
    assert.equal(doc.sampleCount, 3);
    assert.equal(doc.copiedCount, 1);
    assert.deepEqual(doc.sourceMediaIds, ["m1", "m2", "m3"]);
    assert.equal(doc.status, "completed");
    assert.equal(doc.model, "openai/gpt-5.4-mini");
    assert.equal(doc.programId, "primary");
    assert.equal(doc.classroomId, "allstars");
  });

  it("spreads parsed VLM fields", () => {
    const doc = buildBackfillAnalysisDoc(parsed, ctx);
    assert.equal(doc.narrative, "Good progress");
  });
});

// ---------------------------------------------------------------------------
// nextTargetWeek
// ---------------------------------------------------------------------------

describe("nextTargetWeek", () => {
  it("returns W30 for a fresh (null) state doc", () => {
    assert.equal(nextTargetWeek(null), "2026-W30");
  });

  it("returns W30 for empty verifiedWeeks", () => {
    assert.equal(nextTargetWeek({ verifiedWeeks: [] }), "2026-W30");
  });

  it("returns the next unverified week", () => {
    assert.equal(nextTargetWeek({ verifiedWeeks: ["2026-W30", "2026-W31"] }), "2026-W32");
  });

  it("returns null when all weeks verified", () => {
    const all = ["2026-W30", "2026-W31", "2026-W32", "2026-W33", "2026-W34", "2026-W35", "2026-W36"];
    assert.equal(nextTargetWeek({ verifiedWeeks: all }), null);
  });
});

// ---------------------------------------------------------------------------
// getBlockedStudents
// ---------------------------------------------------------------------------

describe("getBlockedStudents", () => {
  it("returns empty set when no prior failures", () => {
    const outcomes = { "2026-W30": { s1: "completed", s2: "skipped:insufficient_samples" } };
    const blocked = getBlockedStudents(outcomes, "2026-W31");
    assert.equal(blocked.size, 0);
  });

  it("blocks students with failed status in earlier week", () => {
    const outcomes = {
      "2026-W30": { s1: "completed", s2: "failed:timeout" },
      "2026-W31": { s1: "completed" },
    };
    const blocked = getBlockedStudents(outcomes, "2026-W32");
    assert.ok(blocked.has("s2"));
    assert.ok(!blocked.has("s1"));
  });

  it("does not block based on current or future weeks", () => {
    const outcomes = {
      "2026-W32": { s1: "failed:error" },
    };
    // Target is W32 itself - should not look at W32
    const blocked = getBlockedStudents(outcomes, "2026-W32");
    assert.equal(blocked.size, 0);
  });
});

// ---------------------------------------------------------------------------
// planLumpCleanup
// ---------------------------------------------------------------------------

describe("planLumpCleanup", () => {
  it("returns restore plan with sourceMediaIds and history entry to restore", () => {
    const combinedDoc = {
      sourceMediaIds: ["m1", "m2", "m3"],
      periodKey: "2026-W37",
    };
    const historyEntries = [
      { id: "2026-07-19T00-35-12-345Z", data: { narrative: "old", archivedAt: "ts" } },
    ];
    const plan = planLumpCleanup(combinedDoc, historyEntries);
    assert.deepEqual(plan.mediaToUnstamp, ["m1", "m2", "m3"]);
    assert.equal(plan.historyEntryToRestore.id, "2026-07-19T00-35-12-345Z");
    assert.equal(plan.historyEntryToRestore.data.narrative, "old");
    assert.ok(!("archivedAt" in plan.historyEntryToRestore.data));
    assert.equal(plan.deleteLiveDoc, false);
  });

  it("returns delete plan when no history (first-ever analysis)", () => {
    const combinedDoc = { sourceMediaIds: ["m1", "m2"] };
    const plan = planLumpCleanup(combinedDoc, []);
    assert.deepEqual(plan.mediaToUnstamp, ["m1", "m2"]);
    assert.equal(plan.historyEntryToRestore, null);
    assert.equal(plan.deleteLiveDoc, true);
  });

  it("aborts when combinedDoc has no sourceMediaIds", () => {
    const combinedDoc = {};
    const historyEntries = [{ id: "x", data: { narrative: "old", archivedAt: "ts" } }];
    assert.throws(() => planLumpCleanup(combinedDoc, historyEntries), /sourceMediaIds/i);
  });
});

// ---------------------------------------------------------------------------
// verifyWeekReport
// ---------------------------------------------------------------------------

describe("verifyWeekReport", () => {
  const weekKey = "2026-W30";

  it("passes when all completed students have correct doc state", () => {
    const outcomes = { s1: "completed", s2: "skipped:insufficient_samples" };
    const fetchedState = {
      s1: {
        liveDoc: { periodKey: "2026-W30", backfilled: true, generatedAt: new Date(), sourceMediaIds: ["m1"] },
        allMediaStamped: true,
        archivePresent: true,
      },
      s2: {
        liveDoc: { periodKey: "2026-W29" }, // untouched
        generatedAtUnchanged: true,
      },
    };
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, true);
    assert.equal(report.failures.length, 0);
  });

  it("fails when completed student has wrong periodKey", () => {
    const outcomes = { s1: "completed" };
    const fetchedState = {
      s1: {
        liveDoc: { periodKey: "2026-W29", backfilled: true, generatedAt: new Date(), sourceMediaIds: ["m1"] },
        allMediaStamped: true,
        archivePresent: true,
      },
    };
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, false);
    assert.ok(report.failures.some((f) => f.studentId === "s1" && f.reason.includes("periodKey")));
  });

  it("fails when completed student has missing backfilled flag", () => {
    const outcomes = { s1: "completed" };
    const fetchedState = {
      s1: {
        liveDoc: { periodKey: "2026-W30", generatedAt: new Date(), sourceMediaIds: ["m1"] },
        allMediaStamped: true,
        archivePresent: true,
      },
    };
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, false);
    assert.ok(report.failures.some((f) => f.reason.includes("backfilled")));
  });

  it("fails when completed student has unstamped media", () => {
    const outcomes = { s1: "completed" };
    const fetchedState = {
      s1: {
        liveDoc: { periodKey: "2026-W30", backfilled: true, generatedAt: new Date(), sourceMediaIds: ["m1"] },
        allMediaStamped: false,
        archivePresent: true,
      },
    };
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, false);
    assert.ok(report.failures.some((f) => f.reason.includes("media")));
  });

  it("fails when skipped student doc was mutated", () => {
    const outcomes = { s1: "skipped:insufficient_samples" };
    const fetchedState = {
      s1: {
        liveDoc: { periodKey: "2026-W29" },
        generatedAtUnchanged: false,
      },
    };
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, false);
    assert.ok(report.failures.some((f) => f.reason.includes("mutated")));
  });

  it("lists failures explicitly (does not fail silently)", () => {
    const outcomes = { s1: "failed:timeout" };
    const fetchedState = {};
    const report = verifyWeekReport(weekKey, outcomes, fetchedState);
    assert.equal(report.pass, false);
    assert.ok(report.failures.some((f) => f.studentId === "s1" && f.reason.includes("failed")));
  });
});

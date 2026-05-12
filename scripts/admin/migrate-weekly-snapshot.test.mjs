import { describe, test } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for the mergeToWeeklySnapshot utility used by the migration script.
 * Validates that baseball_card + signals docs are correctly combined into
 * the unified weekly_snapshot shape.
 */

// ---------------------------------------------------------------------------
// mergeToWeeklySnapshot
// ---------------------------------------------------------------------------

// Inline the merge logic so tests don't depend on Firebase init
function mergeToWeeklySnapshot(cardData, signalsData) {
  const merged = {};

  // Baseball card fields
  if (cardData) {
    merged.summary = cardData.summary ?? "";
    merged.bullets = cardData.bullets ?? [];
    merged.rawContent = cardData.rawContent ?? null;
    merged.sourceNoteIds = cardData.sourceNoteIds ?? [];
    merged.status = cardData.status ?? "ok";
    merged.windowDays = cardData.windowDays ?? null;
    merged.timezone = cardData.timezone ?? null;
    merged.model = cardData.model ?? null;
    merged.temperature = cardData.temperature ?? null;
    merged.generatedAt = cardData.generatedAt ?? null;
    merged.noteCount = cardData.noteCount ?? 0;
  }

  // Signals fields (override noteCount if signals has it)
  if (signalsData) {
    merged.redFlag = signalsData.redFlag ?? { severity: null, reason: null };
    merged.severity = signalsData.severity ?? "clear";
    merged.severityScore = signalsData.severityScore ?? 0;
    merged.prevSeverity = signalsData.prevSeverity ?? "clear";
    merged.prevSeverityScore = signalsData.prevSeverityScore ?? 0;
    merged.weekKey = signalsData.weekKey ?? null;
    merged.weekBaselineSeverity = signalsData.weekBaselineSeverity ?? "clear";
    merged.weekBaselineSeverityScore = signalsData.weekBaselineSeverityScore ?? 0;
    merged.escalatedThisWeek = signalsData.escalatedThisWeek ?? false;
    merged.improvedThisWeek = signalsData.improvedThisWeek ?? false;
    merged.coverageGaps = signalsData.coverageGaps ?? [];
    merged.evidenceCount = signalsData.evidenceCount ?? 0;
    merged.lastUpdatedAt = signalsData.lastUpdatedAt ?? null;
    // Prefer signals noteCount if present
    if (Number.isFinite(signalsData.noteCount)) {
      merged.noteCount = signalsData.noteCount;
    }
    // Use signals generatedAt if card didn't have one
    if (!merged.generatedAt && signalsData.generatedAt) {
      merged.generatedAt = signalsData.generatedAt;
    }
  } else {
    // No signals — set defaults
    merged.redFlag = { severity: null, reason: null };
    merged.severity = "clear";
    merged.severityScore = 0;
    merged.coverageGaps = [];
    merged.escalatedThisWeek = false;
    merged.improvedThisWeek = false;
    merged.evidenceCount = 0;
  }

  merged.migratedAt = "MIGRATION_TIMESTAMP";

  return merged;
}

describe("mergeToWeeklySnapshot", () => {
  test("merges both card and signals into a single doc", () => {
    const card = {
      summary: "Aakash shows strong math skills.",
      bullets: ["Good at addition", "Needs help with reading"],
      noteCount: 15,
      windowDays: 42,
      timezone: "Asia/Kolkata",
      model: "gpt-4o-mini",
      temperature: 0.3,
      generatedAt: new Date("2026-05-05"),
      status: "ok",
      sourceNoteIds: ["obs1", "obs2"],
      rawContent: "raw llm output",
    };
    const signals = {
      redFlag: { severity: "medium", reason: "Social withdrawal" },
      severity: "medium",
      severityScore: 2,
      prevSeverity: "low",
      prevSeverityScore: 1,
      weekKey: "2026-W19",
      weekBaselineSeverity: "low",
      weekBaselineSeverityScore: 1,
      escalatedThisWeek: true,
      improvedThisWeek: false,
      coverageGaps: ["Creative Arts", "Practical Life"],
      noteCount: 15,
      evidenceCount: 12,
      lastUpdatedAt: new Date("2026-05-05"),
    };

    const result = mergeToWeeklySnapshot(card, signals);

    // Baseball card fields
    assert.equal(result.summary, "Aakash shows strong math skills.");
    assert.deepEqual(result.bullets, ["Good at addition", "Needs help with reading"]);
    assert.equal(result.rawContent, "raw llm output");
    assert.deepEqual(result.sourceNoteIds, ["obs1", "obs2"]);
    assert.equal(result.status, "ok");
    assert.equal(result.windowDays, 42);
    assert.equal(result.model, "gpt-4o-mini");

    // Signals fields
    assert.deepEqual(result.redFlag, { severity: "medium", reason: "Social withdrawal" });
    assert.equal(result.severity, "medium");
    assert.equal(result.severityScore, 2);
    assert.equal(result.escalatedThisWeek, true);
    assert.deepEqual(result.coverageGaps, ["Creative Arts", "Practical Life"]);
    assert.equal(result.weekKey, "2026-W19");
    assert.equal(result.evidenceCount, 12);

    // Migration marker
    assert.equal(result.migratedAt, "MIGRATION_TIMESTAMP");
  });

  test("handles card-only (no signals doc)", () => {
    const card = {
      summary: "Good progress.",
      noteCount: 5,
      generatedAt: new Date("2026-05-01"),
      status: "ok",
    };

    const result = mergeToWeeklySnapshot(card, null);

    assert.equal(result.summary, "Good progress.");
    assert.equal(result.noteCount, 5);
    assert.equal(result.severity, "clear");
    assert.equal(result.severityScore, 0);
    assert.deepEqual(result.redFlag, { severity: null, reason: null });
    assert.deepEqual(result.coverageGaps, []);
    assert.equal(result.escalatedThisWeek, false);
  });

  test("handles signals-only (no card doc)", () => {
    const signals = {
      severity: "high",
      severityScore: 3,
      redFlag: { severity: "high", reason: "Aggression" },
      weekKey: "2026-W18",
      coverageGaps: ["Math"],
      noteCount: 8,
      evidenceCount: 6,
      generatedAt: new Date("2026-04-28"),
    };

    const result = mergeToWeeklySnapshot(null, signals);

    assert.equal(result.summary, undefined);
    assert.equal(result.severity, "high");
    assert.equal(result.noteCount, 8);
    assert.equal(result.evidenceCount, 6);
    assert.equal(result.weekKey, "2026-W18");
  });

  test("handles no_notes status", () => {
    const card = {
      summary: "",
      noteCount: 0,
      status: "no_notes",
      redFlag: { severity: null, reason: null },
      coverageGaps: [],
    };
    const signals = {
      severity: "clear",
      severityScore: 0,
      noteCount: 0,
      evidenceCount: 0,
      weekKey: "2026-W19",
      escalatedThisWeek: false,
      improvedThisWeek: false,
      coverageGaps: [],
      redFlag: { severity: null, reason: null },
    };

    const result = mergeToWeeklySnapshot(card, signals);

    assert.equal(result.summary, "");
    assert.equal(result.noteCount, 0);
    assert.equal(result.status, "no_notes");
    assert.equal(result.severity, "clear");
  });
});

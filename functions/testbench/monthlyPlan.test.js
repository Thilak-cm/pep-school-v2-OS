/**
 * PEP-235: Monthly plan CF helper tests
 *
 * Tests the pure helper functions (serialization, formatting).
 * The main testBenchMonthlyPlan function requires Firestore + OpenRouter mocks
 * and is verified via manual e2e testing in the testbench UI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeObservation, serializeMedia, formatWritingAnalysis } from "./monthlyPlan.js";

describe("serializeObservation", () => {
  it("formats a text observation correctly", () => {
    const obs = {
      type: "text",
      text: "Aria worked with the bead chain today",
      observedAt: new Date("2026-05-10"),
      createdByName: "Ms. Priya",
    };
    const result = serializeObservation(obs);
    assert.ok(result.includes("[2026-05-10]"));
    assert.ok(result.includes("(text)"));
    assert.ok(result.includes("bead chain"));
    assert.ok(result.includes("(by Ms. Priya)"));
  });

  it("formats a lesson observation with ratings", () => {
    const obs = {
      type: "lesson",
      lessonTitle: "Addition with Golden Beads",
      lessonDescription: "Introduction to 4-digit addition",
      ratings: { Understanding: "yes", Concentration: "partial" },
      studentComment: "Needed help with carrying",
      observedAt: new Date("2026-05-08"),
    };
    const result = serializeObservation(obs);
    assert.ok(result.includes("(lesson)"));
    assert.ok(result.includes("Addition with Golden Beads"));
    assert.ok(result.includes("Introduction to 4-digit addition"));
    assert.ok(result.includes("Understanding: yes"));
    assert.ok(result.includes("Teacher comment: Needed help with carrying"));
  });

  it("handles missing observedAt gracefully", () => {
    const obs = { type: "text", text: "Hello" };
    const result = serializeObservation(obs);
    assert.ok(result.includes("unknown date"));
  });
});

describe("serializeMedia", () => {
  it("formats a media doc with teacher comment", () => {
    const media = {
      mediaKind: "photo",
      teacherComment: "Great pencil grip progress",
      curriculumArea: "Language",
      observedAt: new Date("2026-05-12"),
      createdByName: "Ms. Priya",
    };
    const result = serializeMedia(media);
    assert.ok(result.includes("[2026-05-12]"));
    assert.ok(result.includes("(media/photo)"));
    assert.ok(result.includes("[Language]"));
    assert.ok(result.includes("Great pencil grip progress"));
    assert.ok(result.includes("(by Ms. Priya)"));
  });

  it("handles media without optional fields", () => {
    const media = { mediaKind: "video", observedAt: new Date("2026-04-01") };
    const result = serializeMedia(media);
    assert.ok(result.includes("(media/video)"));
    assert.ok(!result.includes("undefined"));
  });
});

describe("formatWritingAnalysis", () => {
  it("returns fallback text for null analysis", () => {
    const result = formatWritingAnalysis(null);
    assert.equal(result, "No writing analysis available for this student.");
  });

  it("formats complete analysis with dimension ratings", () => {
    const analysis = {
      narrative: "Aria shows strong letter formation progress",
      dimensionRatings: {
        "Letter Formation": { score: 4, trend: "improving", evidence: "Consistent baseline alignment" },
        "Spacing": { score: 3, trend: "stable", evidence: "Occasional crowding" },
      },
      improvements: ["Baseline consistency", "Letter sizing"],
      concerns: ["Reversed b/d occasionally"],
      recommendations: ["Practice tracing lowercase letters"],
    };
    const result = formatWritingAnalysis(analysis);
    assert.ok(result.includes("Aria shows strong letter formation progress"));
    assert.ok(result.includes("Letter Formation: 4/5 (improving)"));
    assert.ok(result.includes("Spacing: 3/5 (stable)"));
    assert.ok(result.includes("Improvements: Baseline consistency; Letter sizing"));
    assert.ok(result.includes("Concerns: Reversed b/d occasionally"));
    assert.ok(result.includes("Recommendations: Practice tracing lowercase letters"));
  });

  it("handles analysis with only narrative", () => {
    const result = formatWritingAnalysis({ narrative: "Good progress overall" });
    assert.equal(result, "Good progress overall");
  });
});

describe("4-month window calculation", () => {
  it("correctly calculates 4 months ago", () => {
    const now = new Date("2026-06-15");
    const fourMonthsAgo = new Date(now);
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    assert.equal(fourMonthsAgo.getMonth(), 1); // February (0-indexed)
    assert.equal(fourMonthsAgo.getFullYear(), 2026);
  });

  it("handles year boundary correctly", () => {
    const now = new Date("2026-02-15");
    const fourMonthsAgo = new Date(now);
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    assert.equal(fourMonthsAgo.getMonth(), 9); // October (0-indexed)
    assert.equal(fourMonthsAgo.getFullYear(), 2025);
  });
});

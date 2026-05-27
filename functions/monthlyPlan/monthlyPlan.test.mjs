/**
 * PEP-260: Monthly plan production CF helper tests.
 *
 * Tests the pure helper functions (serialization, formatting, prompt assembly)
 * and the archive logic (snapshot before overwrite).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializeObservation,
  serializeMedia,
  formatWritingAnalysis,
  formatFeedback,
  buildUserPrompt,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// serializeObservation
// ---------------------------------------------------------------------------
describe("serializeObservation", () => {
  it("formats a text observation correctly", () => {
    const obs = {
      type: "text",
      text: "Ruhi worked with sandpaper letters S and M",
      observedAt: new Date("2026-05-10"),
      createdByName: "Ms. Priya",
    };
    const result = serializeObservation(obs);
    assert.ok(result.includes("[2026-05-10]"));
    assert.ok(result.includes("(text)"));
    assert.ok(result.includes("sandpaper letters"));
    assert.ok(result.includes("(by Ms. Priya)"));
  });

  it("formats a lesson observation with ratings", () => {
    const obs = {
      type: "lesson",
      lessonTitle: "Number Rods 1-5",
      lessonDescription: "Introduction to quantity and counting",
      ratings: { Understanding: "yes", Concentration: "partial" },
      studentComment: "Needed help with rod 5",
      observedAt: new Date("2026-05-08"),
    };
    const result = serializeObservation(obs);
    assert.ok(result.includes("(lesson)"));
    assert.ok(result.includes("Number Rods 1-5"));
    assert.ok(result.includes("Introduction to quantity and counting"));
    assert.ok(result.includes("Understanding: yes"));
    assert.ok(result.includes("Teacher comment: Needed help with rod 5"));
  });

  it("handles missing observedAt gracefully", () => {
    const obs = { type: "text", text: "Hello" };
    const result = serializeObservation(obs);
    assert.ok(result.includes("unknown date"));
  });
});

// ---------------------------------------------------------------------------
// serializeMedia
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// formatWritingAnalysis
// ---------------------------------------------------------------------------
describe("formatWritingAnalysis", () => {
  it("returns fallback text for null analysis", () => {
    const result = formatWritingAnalysis(null);
    assert.equal(result, "No writing analysis available for this student.");
  });

  it("formats complete analysis with dimension ratings", () => {
    const analysis = {
      narrative: "Ruhi shows strong letter formation progress",
      dimensionRatings: {
        "Letter Formation": { score: 4, trend: "improving", evidence: "Consistent baseline alignment" },
        "Spacing": { score: 3, trend: "stable", evidence: "Occasional crowding" },
      },
      improvements: ["Baseline consistency", "Letter sizing"],
      concerns: ["Reversed b/d occasionally"],
      recommendations: ["Practice tracing lowercase letters"],
    };
    const result = formatWritingAnalysis(analysis);
    assert.ok(result.includes("Ruhi shows strong letter formation progress"));
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

// ---------------------------------------------------------------------------
// buildUserPrompt
// ---------------------------------------------------------------------------
describe("buildUserPrompt", () => {
  const baseProfile = {
    displayName: "Ruhi / Roohi",
    studentId: "2025-AC-COS-008",
    ageStr: "3y 11m",
    programId: "primary",
    targetMonth: "2026-06",
  };

  it("assembles prompt with all inputs present", () => {
    const observations = [
      { type: "text", text: "Worked with sandpaper letters", observedAt: new Date("2026-05-10"), createdByName: "Ms. Priya" },
    ];
    const mediaDocs = [
      { mediaKind: "photo", teacherComment: "Good grip", observedAt: new Date("2026-05-12"), createdByName: "Ms. Priya" },
    ];
    const writingAnalysis = { narrative: "Strong letter formation" };
    const precedingPlan = { month: "2026-05", sections: [{ name: "Language", items: [] }] };

    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations,
      mediaDocs,
      writingAnalysis,
      precedingPlan,
    });

    assert.ok(prompt.includes("Student: Ruhi / Roohi"));
    assert.ok(prompt.includes("Student ID: 2025-AC-COS-008"));
    assert.ok(prompt.includes("Age: 3y 11m"));
    assert.ok(prompt.includes("Program: primary"));
    assert.ok(prompt.includes("Target Month: 2026-06"));
    assert.ok(prompt.includes("=== Writing Analysis ==="));
    assert.ok(prompt.includes("Strong letter formation"));
    assert.ok(prompt.includes("=== Observations (1 notes, most recent first) ==="));
    assert.ok(prompt.includes("sandpaper letters"));
    assert.ok(prompt.includes("=== Media Notes (1 items, most recent first) ==="));
    assert.ok(prompt.includes("Good grip"));
    assert.ok(prompt.includes("=== Preceding Month Plan ==="));
  });

  it("handles missing writing analysis", () => {
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: null,
    });

    assert.ok(prompt.includes("No writing analysis available"));
  });

  it("handles zero observations", () => {
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: null,
    });

    assert.ok(prompt.includes("(No observations found in the last 4 months)"));
    assert.ok(prompt.includes("(No media notes found in the last 4 months)"));
  });

  it("omits preceding plan section when absent", () => {
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: null,
    });

    assert.ok(!prompt.includes("=== Preceding Month Plan ==="));
  });

  it("includes preceding plan when present", () => {
    const plan = {
      month: "2026-05",
      sections: [
        { name: "Language", position: "Early primary", monthlyAim: "Build sound awareness", items: [{ work: "Sandpaper Letters" }] },
      ],
    };
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: plan,
    });

    assert.ok(prompt.includes("=== Preceding Month Plan ==="));
    assert.ok(prompt.includes("Language"));
    assert.ok(prompt.includes("Sandpaper Letters"));
  });

  it("includes feedback section when feedback entries provided", () => {
    const feedback = [
      {
        difficulty: "too_easy",
        pace: "good_pace",
        section: "Language",
        text: "Aria already does bead chains independently",
        createdByName: "Ms. Priya",
        createdAt: "2026-05-15T10:00:00Z",
      },
      {
        text: "Math items are well calibrated",
        section: "General",
        createdByName: "Ms. Priya",
        createdAt: "2026-05-20T14:00:00Z",
      },
    ];
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: null,
      feedback,
    });

    assert.ok(prompt.includes("=== Teacher Feedback on Preceding Plan (2 entries) ==="));
    assert.ok(prompt.includes("too_easy"));
    assert.ok(prompt.includes("good_pace"));
    assert.ok(prompt.includes("Language"));
    assert.ok(prompt.includes("Aria already does bead chains independently"));
    assert.ok(prompt.includes("Math items are well calibrated"));
  });

  it("omits feedback section when no feedback provided", () => {
    const prompt = buildUserPrompt({
      profile: baseProfile,
      observations: [],
      mediaDocs: [],
      writingAnalysis: null,
      precedingPlan: null,
      feedback: [],
    });

    assert.ok(!prompt.includes("=== Teacher Feedback"));
  });
});

// ---------------------------------------------------------------------------
// formatFeedback
// ---------------------------------------------------------------------------
describe("formatFeedback", () => {
  it("formats a complete feedback entry with all fields", () => {
    const entry = {
      difficulty: "too_tough",
      pace: "too_slow",
      section: "Math",
      text: "Number rods are too advanced for this child right now",
      createdByName: "Ms. Priya",
      createdAt: "2026-05-15T10:30:00Z",
    };
    const result = formatFeedback(entry);
    assert.ok(result.includes("[2026-05-15]"));
    assert.ok(result.includes("Difficulty: too_tough"));
    assert.ok(result.includes("Pace: too_slow"));
    assert.ok(result.includes("Section: Math"));
    assert.ok(result.includes("Number rods are too advanced"));
    assert.ok(result.includes("(by Ms. Priya)"));
  });

  it("formats a feedback entry with only text", () => {
    const entry = {
      text: "Good plan overall",
      createdAt: "2026-05-20T09:00:00Z",
    };
    const result = formatFeedback(entry);
    assert.ok(result.includes("Good plan overall"));
    assert.ok(!result.includes("Difficulty:"));
    assert.ok(!result.includes("Pace:"));
  });

  it("formats a feedback entry with only difficulty (no text)", () => {
    const entry = {
      difficulty: "about_right",
      createdAt: "2026-05-18T08:00:00Z",
    };
    const result = formatFeedback(entry);
    assert.ok(result.includes("Difficulty: about_right"));
    assert.ok(!result.includes("Pace:"));
  });
});

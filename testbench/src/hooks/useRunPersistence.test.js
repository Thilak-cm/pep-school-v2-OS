/**
 * PEP-223: Run persistence logic tests
 *
 * Tests pure functions for save payload construction, run restoration,
 * and session naming (subsumes sessionNaming.test.js).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSavePayload, restoreVariantsFromRun, restoreConversationsFromRun, buildSessionNameField, getRunLabel } from "./useRunPersistence.js";

// --- buildSavePayload ---

describe("buildSavePayload", () => {
  const baseArgs = {
    featureId: "handwriting_analysis",
    selectedStudent: { id: "STU-001", displayName: "Test Student" },
    variants: [
      { name: "Variant A", systemPrompt: "prompt", guidelinesContent: "", model: "gpt-4o", temperature: 0.3, max_tokens: 2000, output: "result", rating: 7, notes: "good" },
    ],
    conversations: {},
    sessionName: "",
    kickoffMessage: "",
    user: { uid: "u1", displayName: "Thilak" },
  };

  it("includes feature, studentId, studentName", () => {
    const payload = buildSavePayload(baseArgs);
    assert.equal(payload.feature, "handwriting_analysis");
    assert.equal(payload.studentId, "STU-001");
    assert.equal(payload.studentName, "Test Student");
  });

  it("maps variants to prompt/output/rating shape", () => {
    const payload = buildSavePayload(baseArgs);
    assert.equal(payload.variants.length, 1);
    assert.equal(payload.variants[0].name, "Variant A");
    assert.equal(payload.variants[0].prompt.systemPrompt, "prompt");
    assert.equal(payload.variants[0].output, "result");
    assert.equal(payload.variants[0].rating, 7);
  });

  it("omits sessionName when blank", () => {
    const payload = buildSavePayload(baseArgs);
    assert.equal(payload.sessionName, undefined);
  });

  it("includes sessionName when non-blank", () => {
    const payload = buildSavePayload({ ...baseArgs, sessionName: "My Run" });
    assert.equal(payload.sessionName, "My Run");
  });

  it("includes guidelinesContent in variant prompt when present", () => {
    const args = {
      ...baseArgs,
      variants: [{ ...baseArgs.variants[0], guidelinesContent: "## Areas" }],
    };
    const payload = buildSavePayload(args);
    assert.equal(payload.variants[0].prompt.guidelinesContent, "## Areas");
  });

  it("omits guidelinesContent when empty", () => {
    const payload = buildSavePayload(baseArgs);
    assert.equal(payload.variants[0].prompt.guidelinesContent, undefined);
  });

  it("includes conversation per variant for interview feature", () => {
    const args = {
      ...baseArgs,
      featureId: "interview_question_gen",
      conversations: { 0: [{ type: "question", question: "Q1" }] },
    };
    const payload = buildSavePayload(args);
    assert.deepEqual(payload.variants[0].conversation, [{ type: "question", question: "Q1" }]);
  });

  it("includes kickoffMessage for interview feature", () => {
    const args = {
      ...baseArgs,
      featureId: "interview_question_gen",
      kickoffMessage: "Start now",
    };
    const payload = buildSavePayload(args);
    assert.equal(payload.kickoffMessage, "Start now");
  });

  it("omits kickoffMessage for non-interview features", () => {
    const payload = buildSavePayload(baseArgs);
    assert.equal(payload.kickoffMessage, undefined);
  });

  it("includes ranBy with uid and name", () => {
    const payload = buildSavePayload(baseArgs);
    assert.deepEqual(payload.ranBy, { uid: "u1", name: "Thilak" });
  });

  it("uses classroomId/classroomName for digest_generation feature", () => {
    const args = {
      ...baseArgs,
      featureId: "digest_generation",
      selectedClassroom: { id: "allstars", name: "All Stars" },
      selectedStudent: null,
      promptType: "classroom",
    };
    const payload = buildSavePayload(args);
    assert.equal(payload.classroomId, "allstars");
    assert.equal(payload.classroomName, "All Stars");
    assert.equal(payload.promptType, "classroom");
    assert.equal(payload.studentId, undefined);
    assert.equal(payload.studentName, undefined);
  });

  it("includes promptType superadmin for digest_generation", () => {
    const args = {
      ...baseArgs,
      featureId: "digest_generation",
      selectedClassroom: { id: "periwinkle", name: "Periwinkle" },
      selectedStudent: null,
      promptType: "superadmin",
    };
    const payload = buildSavePayload(args);
    assert.equal(payload.promptType, "superadmin");
    assert.equal(payload.classroomId, "periwinkle");
  });

  it("includes interviewMode and selectedAreas for interview feature", () => {
    const args = {
      ...baseArgs,
      featureId: "interview_question_gen",
      interviewMode: "teacher_pick",
      selectedAreas: ["Self-Regulation", "Mathematics"],
    };
    const payload = buildSavePayload(args);
    assert.equal(payload.interviewMode, "teacher_pick");
    assert.deepEqual(payload.selectedAreas, ["Self-Regulation", "Mathematics"]);
  });

  it("omits interviewMode and selectedAreas for non-interview features", () => {
    const args = { ...baseArgs, interviewMode: "random", selectedAreas: ["X"] };
    const payload = buildSavePayload(args);
    assert.equal(payload.interviewMode, undefined);
    assert.equal(payload.selectedAreas, undefined);
  });

  it("includes programId for report_generation feature", () => {
    const args = { ...baseArgs, featureId: "report_generation", programId: "elementary" };
    const payload = buildSavePayload(args);
    assert.equal(payload.programId, "elementary");
  });

  it("omits programId for non-report features", () => {
    const args = { ...baseArgs, featureId: "handwriting_analysis", programId: "primary" };
    const payload = buildSavePayload(args);
    assert.equal(payload.programId, undefined);
  });
});

// --- restoreVariantsFromRun ---

describe("restoreVariantsFromRun", () => {
  it("restores variant shape from saved run", () => {
    const run = {
      variants: [
        { name: "Variant A", prompt: { systemPrompt: "p1", model: "gpt-4o", temperature: 0.5, max_tokens: 3000 }, output: "out1", rating: 8, notes: "nice" },
        { name: "Variant B", prompt: { systemPrompt: "p2", guidelinesContent: "## G" }, output: "out2", rating: 6, notes: "" },
      ],
    };
    const result = restoreVariantsFromRun(run);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "Variant A");
    assert.equal(result[0].systemPrompt, "p1");
    assert.equal(result[0].model, "gpt-4o");
    assert.equal(result[0].temperature, 0.5);
    assert.equal(result[0].output, "out1");
    assert.equal(result[1].guidelinesContent, "## G");
  });

  it("returns empty array for run with no variants", () => {
    assert.deepEqual(restoreVariantsFromRun({}), []);
  });

  it("restores classroom context from digest run", () => {
    const run = {
      feature: "digest_generation",
      classroomId: "allstars",
      classroomName: "All Stars",
      promptType: "classroom",
      variants: [
        { name: "Variant A", prompt: { systemPrompt: "p1", model: "gpt-4o", temperature: 0.4, max_tokens: 4000 }, output: "<h1>Digest</h1>", rating: 8, notes: "" },
      ],
    };
    const result = restoreVariantsFromRun(run);
    assert.equal(result.length, 1);
    assert.equal(result[0].systemPrompt, "p1");
    assert.equal(result[0].output, "<h1>Digest</h1>");
  });
});

// --- restoreConversationsFromRun ---

describe("restoreConversationsFromRun", () => {
  it("restores conversation map from saved run", () => {
    const run = {
      variants: [
        { conversation: [{ type: "question", question: "Q1" }] },
        { name: "B" }, // no conversation
      ],
    };
    const result = restoreConversationsFromRun(run);
    assert.deepEqual(result, { 0: [{ type: "question", question: "Q1" }] });
  });

  it("returns empty object when no conversations", () => {
    const result = restoreConversationsFromRun({ variants: [{ name: "A" }] });
    assert.deepEqual(result, {});
  });
});

// --- buildSessionNameField (migrated from sessionNaming.test.js) ---

describe("buildSessionNameField", () => {
  it("includes sessionName when a non-empty string is provided", () => {
    assert.equal(buildSessionNameField("My Test Run"), "My Test Run");
  });

  it("returns undefined for empty string", () => {
    assert.equal(buildSessionNameField(""), undefined);
  });

  it("returns undefined for whitespace-only string", () => {
    assert.equal(buildSessionNameField("   "), undefined);
  });

  it("trims leading/trailing whitespace", () => {
    assert.equal(buildSessionNameField("  Run Alpha  "), "Run Alpha");
  });

  it("returns undefined for null/undefined input", () => {
    assert.equal(buildSessionNameField(null), undefined);
    assert.equal(buildSessionNameField(undefined), undefined);
  });
});

// --- getRunLabel (migrated from sessionNaming.test.js) ---

describe("getRunLabel", () => {
  it("shows sessionName when present", () => {
    assert.equal(getRunLabel({ sessionName: "My Session", studentName: "Aakash" }), "My Session");
  });

  it("falls back to studentName when sessionName is absent", () => {
    assert.equal(getRunLabel({ studentName: "Aakash" }), "Aakash");
  });

  it("falls back to studentName when sessionName is empty", () => {
    assert.equal(getRunLabel({ sessionName: "", studentName: "Aakash" }), "Aakash");
  });

  it("falls back to studentName when sessionName is whitespace-only", () => {
    assert.equal(getRunLabel({ sessionName: "   ", studentName: "Aakash" }), "Aakash");
  });

  it("returns empty string when both fields are missing", () => {
    assert.equal(getRunLabel({}), "");
  });

  it("falls back to classroomName for digest runs without sessionName", () => {
    assert.equal(getRunLabel({ classroomName: "All Stars" }), "All Stars");
  });

  it("prefers sessionName over classroomName for digest runs", () => {
    assert.equal(getRunLabel({ sessionName: "Prompt v2", classroomName: "All Stars" }), "Prompt v2");
  });
});

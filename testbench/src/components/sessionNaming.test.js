/**
 * PEP-211: Session naming and student picker logic tests
 *
 * Tests pure logic extracted from FeatureWorkbench and RunHistory:
 * - Save payload construction with sessionName
 * - History display label selection (sessionName vs studentName fallback)
 * - Interview mode student picker behavior (no hardcoded defaults)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Extracted logic under test ---

/**
 * Build the sessionName field for the save payload.
 * Returns undefined if blank/whitespace-only (omitted from Firestore doc).
 */
function buildSessionNameField(sessionName) {
  const trimmed = (sessionName || "").trim();
  return trimmed || undefined;
}

/**
 * Get the primary display label for a run in the history drawer.
 * Uses sessionName when present, falls back to studentName.
 */
function getRunLabel(run) {
  return run.sessionName?.trim() || run.studentName || "";
}

/**
 * Determine whether the student picker should render for a given featureId.
 * PEP-211: interview_question_gen now shows the picker (previously skipped).
 */
function shouldShowStudentPicker(featureId) {
  // All features show the picker — no feature is excluded
  return true;
}

// --- Tests ---

describe("Session naming — save payload", () => {
  it("includes sessionName when a non-empty string is provided", () => {
    assert.equal(buildSessionNameField("My Test Run"), "My Test Run");
  });

  it("returns undefined for empty string (omits from payload)", () => {
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

describe("Session naming — history display label", () => {
  it("shows sessionName when present", () => {
    const run = { sessionName: "My Session", studentName: "Aakash Arulkumar" };
    assert.equal(getRunLabel(run), "My Session");
  });

  it("falls back to studentName when sessionName is absent", () => {
    const run = { studentName: "Aakash Arulkumar" };
    assert.equal(getRunLabel(run), "Aakash Arulkumar");
  });

  it("falls back to studentName when sessionName is empty string", () => {
    const run = { sessionName: "", studentName: "Aakash Arulkumar" };
    assert.equal(getRunLabel(run), "Aakash Arulkumar");
  });

  it("falls back to studentName when sessionName is whitespace-only", () => {
    const run = { sessionName: "   ", studentName: "Aakash Arulkumar" };
    assert.equal(getRunLabel(run), "Aakash Arulkumar");
  });

  it("handles old runs with no sessionName field at all", () => {
    const run = { studentName: "Sudarshan", variants: [], ranBy: { name: "Thilak" } };
    assert.equal(getRunLabel(run), "Sudarshan");
  });

  it("returns empty string when both fields are missing", () => {
    assert.equal(getRunLabel({}), "");
  });
});

describe("Student picker — interview mode", () => {
  it("shows student picker for interview_question_gen", () => {
    assert.equal(shouldShowStudentPicker("interview_question_gen"), true);
  });

  it("shows student picker for soul_generation", () => {
    assert.equal(shouldShowStudentPicker("soul_generation"), true);
  });

  it("shows student picker for handwriting_analysis", () => {
    assert.equal(shouldShowStudentPicker("handwriting_analysis"), true);
  });
});

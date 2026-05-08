/**
 * Tests for testBenchInterviewTurn helper (PEP-172, PEP-208).
 *
 * Covers assembleSystemPrompt template replacement and cold-start helpers.
 *
 * Run: node --test functions/testbench/interviewQuestions.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleSystemPrompt } from "./promptAssembly.js";
import { pickRandomAreas, pickRandomQuestion, buildSyntheticTurn } from "./interviewColdStart.js";

const TEMPLATE = `You are an interview agent.

STUDENT CONTEXT:
Name: \${studentName}
Age: \${age}
Program: \${programId}

SOUL NARRATIVE:
\${soul}

GUIDELINES:
\${guidelines}

\${baseballCard}

\${openQuestions}

\${sessionProgress}

Ask questions.`;

// Legacy flat-array shape for backwards-compat tests
const STUDENT_DATA = {
  studentName: "Aakash Arulkumar",
  age: "14y 2m",
  programId: "adolescent",
  soul: "A bold, energetic adolescent who thrives in sport and practical work.",
  guidelines: "## Social-Emotional Development\n### Self-Regulation\n- Manages emotions during transitions",
  baseballCard: {
    windowDays: 42,
    noteCount: 30,
    summary: "Strong in athletics, struggles with written follow-through.",
    coverageGaps: ["Mathematics", "Hindi"],
  },
  openQuestions: {
    "Self-Regulation": [
      "What triggers Aakash's arguments with teachers?",
      "How does he respond after cooling down?",
    ],
    "Mathematics": [
      "What level of math work does Aakash engage with independently?",
    ],
  },
  priorInterviews: [],
};

describe("assembleSystemPrompt", () => {
  it("replaces all student context placeholders", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("Aakash Arulkumar"), "Should include student name");
    assert.ok(result.includes("14y 2m"), "Should include age");
    assert.ok(result.includes("adolescent"), "Should include program");
  });

  it("injects soul narrative", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("bold, energetic adolescent"), "Should include soul text");
  });

  it("injects guidelines content", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("Self-Regulation"), "Should include guidelines");
  });

  it("formats baseball card with coverage gaps", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("BASEBALL CARD"), "Should include baseball card header");
    assert.ok(result.includes("42-day summary"), "Should include window days");
    assert.ok(result.includes("30 observations"), "Should include note count");
    assert.ok(result.includes("Mathematics, Hindi"), "Should include coverage gaps");
  });

  it("handles missing baseball card", () => {
    const data = { ...STUDENT_DATA, baseballCard: null };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(result.includes("No baseball card available"), "Should show fallback text");
  });

  it("formats open questions grouped by area", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("OPEN QUESTIONS BANK"), "Should include questions bank header");
    assert.ok(result.includes("Self-Regulation"), "Should include area name as header");
    assert.ok(result.includes("Mathematics"), "Should include second area name");
    assert.ok(result.includes("What triggers"), "Should include question text");
    assert.ok(result.includes("3 questions across 2 areas"), "Should show total count");
  });

  it("handles missing open questions", () => {
    const data = { ...STUDENT_DATA, openQuestions: null };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(!result.includes("OPEN QUESTIONS BANK"), "Should not include questions bank");
  });

  it("handles empty areas object", () => {
    const data = { ...STUDENT_DATA, openQuestions: {} };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(!result.includes("OPEN QUESTIONS BANK"), "Should not include questions bank for empty areas");
  });

  it("appends prior interview transcripts when present", () => {
    const data = {
      ...STUDENT_DATA,
      priorInterviews: [{ teacherName: "Priya R", conductedAt: "2026-04-20", exchanges: [] }],
    };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(result.includes("PRIOR INTERVIEW TRANSCRIPTS"), "Should include interview header");
    assert.ok(result.includes("Priya R"), "Should include teacher name");
  });

  it("does not append interview section when no prior interviews", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(!result.includes("PRIOR INTERVIEW TRANSCRIPTS"), "Should not include interview section");
  });

  it("handles missing soul gracefully", () => {
    const data = { ...STUDENT_DATA, soul: null };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(result.includes("No soul narrative available"), "Should show fallback for missing soul");
  });

  it("renders session progress when provided", () => {
    const data = { ...STUDENT_DATA, sessionProgress: { questionCount: 4, elapsedMinutes: 6.5 } };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(result.includes("question 4"), "Should include question count");
    assert.ok(result.includes("6.5 minutes"), "Should include elapsed time");
    assert.ok(result.includes("wrap up"), "Should include wrap-up guidance");
    assert.ok(result.includes("interviewComplete"), "Should include interviewComplete output format");
    assert.ok(result.includes("closingRemarks"), "Should include closingRemarks in output format");
    // Verify session progress appears exactly once (not duplicated via placeholder + append)
    assert.equal((result.match(/SESSION PROGRESS/g) || []).length, 1, "SESSION PROGRESS should appear exactly once");
  });

  it("omits session progress when not provided", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(!result.includes("SESSION PROGRESS"), "Should not include session progress");
    assert.ok(!result.includes("interviewComplete"), "Should not include termination format");
  });
});

describe("pickRandomAreas", () => {
  const AREAS = {
    "Self-Regulation": ["Q1", "Q2"],
    "Mathematics": ["Q3"],
    "Language": ["Q4", "Q5"],
    "Social": ["Q6"],
  };

  it("returns exactly N area keys", () => {
    const result = pickRandomAreas(AREAS, 2);
    assert.equal(result.length, 2, "Should return 2 areas");
    for (const key of result) {
      assert.ok(key in AREAS, `${key} should be a valid area key`);
    }
  });

  it("returns all keys when N >= total areas", () => {
    const result = pickRandomAreas(AREAS, 10);
    assert.equal(result.length, 4, "Should return all 4 areas when N exceeds count");
  });

  it("returns unique keys (no duplicates)", () => {
    const result = pickRandomAreas(AREAS, 3);
    const unique = new Set(result);
    assert.equal(unique.size, result.length, "Should have no duplicate keys");
  });

  it("throws on empty areas object", () => {
    assert.throws(() => pickRandomAreas({}, 2), /no areas/i, "Should throw for empty areas");
  });
});

describe("pickRandomQuestion", () => {
  const AREAS = {
    "Self-Regulation": ["Q1", "Q2"],
    "Mathematics": ["Q3"],
  };

  it("returns a question from the selected areas", () => {
    const { question, area } = pickRandomQuestion(AREAS, ["Self-Regulation", "Mathematics"]);
    assert.ok(typeof question === "string", "Should return a string question");
    assert.ok(["Self-Regulation", "Mathematics"].includes(area), "Area should be one of the selected");
    const allQuestions = [...AREAS["Self-Regulation"], ...AREAS["Mathematics"]];
    assert.ok(allQuestions.includes(question), "Question should come from selected areas");
  });

  it("returns area name alongside question", () => {
    const result = pickRandomQuestion(AREAS, ["Mathematics"]);
    assert.equal(result.area, "Mathematics");
    assert.equal(result.question, "Q3");
  });
});

describe("buildSyntheticTurn", () => {
  it("produces a turn object with correct shape", () => {
    const selectedAreas = [
      { area: "Self-Regulation", rationale: "Key area for this student" },
      { area: "Mathematics", rationale: "Coverage gap identified" },
    ];
    const turn = buildSyntheticTurn({
      questionText: "What triggers arguments?",
      questionArea: "Self-Regulation",
      explorationAreas: selectedAreas,
    });

    assert.equal(turn.type, "question", "type should be 'question'");
    assert.equal(turn.question.text, "What triggers arguments?", "question.text should match");
    assert.equal(turn.question.area, "Self-Regulation", "question.area should match");
    assert.deepEqual(turn.explorationAreas, selectedAreas, "explorationAreas should match");
    assert.equal(turn.thinking, null, "thinking should be null for synthetic turn");
    assert.ok(typeof turn.rawContent === "string", "rawContent should be a JSON string");
    assert.ok(turn.meta.synthetic === true, "meta.synthetic should be true");
  });

  it("rawContent is valid JSON matching LLM response shape", () => {
    const turn = buildSyntheticTurn({
      questionText: "How does he cope?",
      questionArea: "Social",
      explorationAreas: [{ area: "Social", rationale: "test" }],
    });
    const parsed = JSON.parse(turn.rawContent);
    assert.ok(parsed.question, "rawContent JSON should have question field");
    assert.equal(parsed.question.text, "How does he cope?");
    assert.ok(parsed.explorationAreas, "rawContent JSON should have explorationAreas");
    assert.equal(parsed.interviewComplete, false, "interviewComplete should be false");
  });
});

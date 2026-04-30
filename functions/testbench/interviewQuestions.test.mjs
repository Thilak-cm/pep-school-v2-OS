/**
 * Tests for testBenchInterviewTurn helper (PEP-172).
 *
 * Covers assembleSystemPrompt template replacement — the pure function
 * that injects student data into the prompt template.
 *
 * Run: node --test functions/testbench/interviewQuestions.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleSystemPrompt } from "./promptAssembly.js";

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

Ask questions.`;

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
  openQuestions: [
    "What triggers Aakash's arguments with teachers?",
    "How does he respond after cooling down?",
  ],
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

  it("formats open questions as numbered list", () => {
    const result = assembleSystemPrompt(TEMPLATE, STUDENT_DATA);
    assert.ok(result.includes("OPEN QUESTIONS BANK"), "Should include questions bank header");
    assert.ok(result.includes("1. What triggers"), "Should include numbered question");
    assert.ok(result.includes("2. How does he"), "Should include second question");
    assert.ok(result.includes("2 pre-generated"), "Should show question count");
  });

  it("handles missing open questions", () => {
    const data = { ...STUDENT_DATA, openQuestions: null };
    const result = assembleSystemPrompt(TEMPLATE, data);
    assert.ok(!result.includes("OPEN QUESTIONS BANK"), "Should not include questions bank");
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
});

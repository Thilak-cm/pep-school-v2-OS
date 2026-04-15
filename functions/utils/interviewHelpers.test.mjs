/**
 * Tests for interview transcript helpers.
 *
 * Run with: node --test functions/utils/interviewHelpers.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { formatInterviewForPrompt } from "./interviewHelpers.js";

// ---------------------------------------------------------------------------
// Sample interview transcript (mirrors Firestore schema)
// ---------------------------------------------------------------------------

const SAMPLE_INTERVIEW = {
  teacherId: "uid-teacher-a",
  teacherName: "Ms. Priya",
  classroomId: "allstars",
  programId: "adolescent",
  conductedAt: new Date("2026-04-10T09:00:00Z"),
  completedAt: new Date("2026-04-10T09:12:00Z"),
  status: "completed",
  questionCount: 3,
  dimensionsCovered: ["technology_research", "indian_languages"],
  exchanges: [
    {
      questionId: 1,
      questionText: "When Aakash is doing research, which stage needs the most support?",
      questionType: "mcq",
      dimension: "technology_research",
      options: [
        "Finding sources",
        "Reading and note-taking",
        "Organising into output",
        "Presenting final work",
      ],
      selectedOption: 1,
      responseText: null,
      askedAt: new Date("2026-04-10T09:01:00Z"),
      answeredAt: new Date("2026-04-10T09:02:30Z"),
    },
    {
      questionId: 2,
      questionText: "Can you walk me through a recent research project Aakash did?",
      questionType: "open",
      dimension: "technology_research",
      options: null,
      selectedOption: null,
      responseText: "He was working on a solar energy project and managed to find two articles but struggled to take notes from them.",
      askedAt: new Date("2026-04-10T09:03:00Z"),
      answeredAt: new Date("2026-04-10T09:05:00Z"),
    },
    {
      questionId: 3,
      questionText: "In Kannada or Hindi, what can Aakash do independently?",
      questionType: "mcq",
      dimension: "indian_languages",
      options: [
        "Mostly oral, avoids reading/writing",
        "Reads short passages, writes with support",
        "Reads and writes independently",
        "Reads, writes, and revises longer work",
      ],
      selectedOption: 0,
      responseText: null,
      askedAt: new Date("2026-04-10T09:06:00Z"),
      answeredAt: new Date("2026-04-10T09:07:00Z"),
    },
  ],
};

// ---------------------------------------------------------------------------
// formatInterviewForPrompt
// ---------------------------------------------------------------------------

test("formatInterviewForPrompt - returns expected structure", () => {
  const result = formatInterviewForPrompt(SAMPLE_INTERVIEW);

  assert.equal(result.teacherName, "Ms. Priya");
  assert.equal(result.conductedAt, "2026-04-10T09:00:00.000Z");
  assert.ok(Array.isArray(result.exchanges));
  assert.equal(result.exchanges.length, 3);
});

test("formatInterviewForPrompt - MCQ exchange includes selected option text", () => {
  const result = formatInterviewForPrompt(SAMPLE_INTERVIEW);
  const mcq = result.exchanges[0];

  assert.equal(mcq.dimension, "technology_research");
  assert.equal(mcq.questionType, "mcq");
  assert.equal(mcq.selectedOptionText, "Reading and note-taking");
  assert.equal(typeof mcq.questionText, "string");
});

test("formatInterviewForPrompt - open exchange includes response text", () => {
  const result = formatInterviewForPrompt(SAMPLE_INTERVIEW);
  const open = result.exchanges[1];

  assert.equal(open.questionType, "open");
  assert.equal(open.responseText, "He was working on a solar energy project and managed to find two articles but struggled to take notes from them.");
  assert.equal(open.selectedOptionText, undefined);
});

test("formatInterviewForPrompt - strips internal fields not needed for LLM", () => {
  const result = formatInterviewForPrompt(SAMPLE_INTERVIEW);
  const exchange = result.exchanges[0];

  // Should not have raw options array or selectedOption index — just the resolved text
  assert.equal(exchange.options, undefined);
  assert.equal(exchange.selectedOption, undefined);
  // Should not have timestamps (not useful for profile LLM)
  assert.equal(exchange.askedAt, undefined);
  assert.equal(exchange.answeredAt, undefined);
});

test("formatInterviewForPrompt - handles abandoned interview (null completedAt)", () => {
  const abandoned = {
    ...SAMPLE_INTERVIEW,
    status: "abandoned",
    completedAt: null,
    exchanges: [
      {
        ...SAMPLE_INTERVIEW.exchanges[0],
        selectedOption: null, // unanswered
        answeredAt: null,
      },
    ],
  };

  const result = formatInterviewForPrompt(abandoned);
  assert.equal(result.status, "abandoned");
  // Unanswered MCQ should have null selectedOptionText
  assert.equal(result.exchanges[0].selectedOptionText, null);
});

test("formatInterviewForPrompt - handles Firestore Timestamp objects", () => {
  // Firestore Timestamps have a toDate() method
  const firestoreTimestamp = {
    toDate: () => new Date("2026-04-10T09:00:00Z"),
  };

  const withTimestamp = {
    ...SAMPLE_INTERVIEW,
    conductedAt: firestoreTimestamp,
    completedAt: firestoreTimestamp,
  };

  const result = formatInterviewForPrompt(withTimestamp);
  assert.equal(result.conductedAt, "2026-04-10T09:00:00.000Z");
});

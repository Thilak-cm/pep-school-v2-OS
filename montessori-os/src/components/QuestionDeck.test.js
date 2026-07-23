/**
 * #216: Structural tests for QuestionDeck multi-POV helpers.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import helpers directly from QuestionDeck - they are module-private,
// so we test via a re-export file or inline the logic here.
// Since normalizeAreas and sort logic are internal, we replicate them
// as pure functions and test the contract.

/**
 * Replicate normalizeAreas from QuestionDeck.jsx for testing.
 * Must match the actual implementation.
 */
function normalizeAreas(areas) {
  if (!areas || typeof areas !== "object") return {};
  const out = {};
  for (const [area, questions] of Object.entries(areas)) {
    if (!Array.isArray(questions)) continue;
    out[area] = questions.map((q) => {
      if (typeof q === "string") return { question: q, answers: [] };
      if (q.answers) return q;
      if (q.status === "answered") {
        return {
          question: q.question,
          answers: [{
            answeredAt: q.answeredAt || null,
            method: q.method || "voice",
            observationId: q.observationId || null,
            answeredBy: q.answeredBy || { uid: "", name: "Unknown" },
          }],
        };
      }
      return { question: q.question, answers: [] };
    });
  }
  return out;
}

/**
 * Replicate area sort logic from QuestionDeck.jsx for testing.
 */
function sortAreas(areas) {
  return Object.entries(areas).sort(([aName, aQs], [bName, bQs]) => {
    const aTotal = aQs.length;
    const bTotal = bQs.length;
    const aAnswered = aQs.filter((q) => q.answers?.length > 0).length;
    const bAnswered = bQs.filter((q) => q.answers?.length > 0).length;
    const aRatio = aTotal > 0 ? aAnswered / aTotal : 0;
    const bRatio = bTotal > 0 ? bAnswered / bTotal : 0;
    if (bRatio !== aRatio) return bRatio - aRatio;
    return aName.localeCompare(bName);
  });
}

/**
 * Determine CTA state for a question row.
 */
function getQuestionCTAState(question, currentUserUid) {
  const answers = question.answers || [];
  if (answers.length === 0) return "pending";
  const currentUserAnswered = answers.some((a) => a.answeredBy?.uid === currentUserUid);
  return currentUserAnswered ? "self-answered" : "others-answered";
}

// ── normalizeAreas ──

describe("normalizeAreas (#216)", () => {
  it("converts string arrays to { question, answers: [] }", () => {
    const result = normalizeAreas({
      "Math": ["How does the child count?", "Can they add?"],
    });
    assert.deepStrictEqual(result.Math, [
      { question: "How does the child count?", answers: [] },
      { question: "Can they add?", answers: [] },
    ]);
  });

  it("passes through enriched objects with answers array", () => {
    const input = {
      "Math": [{ question: "How does the child count?", answers: [{ answeredBy: { uid: "u1", name: "Priya" } }] }],
    };
    const result = normalizeAreas(input);
    assert.equal(result.Math[0].answers.length, 1);
    assert.equal(result.Math[0].answers[0].answeredBy.uid, "u1");
  });

  it("handles null/undefined areas", () => {
    assert.deepStrictEqual(normalizeAreas(null), {});
    assert.deepStrictEqual(normalizeAreas(undefined), {});
  });

  it("skips non-array area values", () => {
    const result = normalizeAreas({ "Math": "not an array" });
    assert.deepStrictEqual(result, {});
  });

  it("converts legacy #144 flat answered shape to answers array", () => {
    const input = {
      "Math": [{
        question: "How does the child count?",
        status: "answered",
        answeredAt: 1234567890,
        method: "voice",
        observationId: "obs1",
        answeredBy: { uid: "u1", name: "Priya" },
      }],
    };
    const result = normalizeAreas(input);
    assert.equal(result.Math[0].answers.length, 1);
    assert.equal(result.Math[0].answers[0].method, "voice");
    assert.equal(result.Math[0].answers[0].observationId, "obs1");
    assert.equal(result.Math[0].answers[0].answeredBy.uid, "u1");
    assert.equal(result.Math[0].status, undefined, "legacy status field should be stripped");
  });

  it("converts legacy #144 flat pending shape to empty answers array", () => {
    const input = {
      "Math": [{ question: "How does the child count?", status: "pending" }],
    };
    const result = normalizeAreas(input);
    assert.deepStrictEqual(result.Math[0], { question: "How does the child count?", answers: [] });
  });
});

// ── area sort ──

describe("sortAreas (#216)", () => {
  it("sorts by progress ratio descending", () => {
    const areas = {
      "Math": [
        { question: "q1", answers: [{ answeredBy: { uid: "u1" } }] },
        { question: "q2", answers: [] },
      ],
      "Reading": [
        { question: "q1", answers: [{ answeredBy: { uid: "u1" } }] },
      ],
    };
    const sorted = sortAreas(areas);
    // Reading is 1/1 (100%), Math is 1/2 (50%)
    assert.equal(sorted[0][0], "Reading");
    assert.equal(sorted[1][0], "Math");
  });

  it("sorts alphabetically within same ratio", () => {
    const areas = {
      "Zebra": [{ question: "q1", answers: [] }],
      "Alpha": [{ question: "q1", answers: [] }],
    };
    const sorted = sortAreas(areas);
    assert.equal(sorted[0][0], "Alpha");
    assert.equal(sorted[1][0], "Zebra");
  });

  it("sorts all-zero areas alphabetically", () => {
    const areas = {
      "C": [{ question: "q1", answers: [] }],
      "A": [{ question: "q1", answers: [] }],
      "B": [{ question: "q1", answers: [] }],
    };
    const sorted = sortAreas(areas);
    assert.equal(sorted[0][0], "A");
    assert.equal(sorted[1][0], "B");
    assert.equal(sorted[2][0], "C");
  });
});

// ── CTA state ──

describe("getQuestionCTAState (#216)", () => {
  it("returns 'pending' for zero answers", () => {
    assert.equal(getQuestionCTAState({ question: "q1", answers: [] }, "u1"), "pending");
  });

  it("returns 'pending' when answers is undefined", () => {
    assert.equal(getQuestionCTAState({ question: "q1" }, "u1"), "pending");
  });

  it("returns 'others-answered' when answered by other teachers only", () => {
    const q = {
      question: "q1",
      answers: [{ answeredBy: { uid: "u2", name: "Ravi" } }],
    };
    assert.equal(getQuestionCTAState(q, "u1"), "others-answered");
  });

  it("returns 'self-answered' when current user has answered", () => {
    const q = {
      question: "q1",
      answers: [
        { answeredBy: { uid: "u2", name: "Ravi" } },
        { answeredBy: { uid: "u1", name: "Priya" } },
      ],
    };
    assert.equal(getQuestionCTAState(q, "u1"), "self-answered");
  });

  it("returns 'self-answered' when current user is the only answerer", () => {
    const q = {
      question: "q1",
      answers: [{ answeredBy: { uid: "u1", name: "Priya" } }],
    };
    assert.equal(getQuestionCTAState(q, "u1"), "self-answered");
  });

  it("handles repeat answers from same user", () => {
    const q = {
      question: "q1",
      answers: [
        { answeredBy: { uid: "u1", name: "Priya" } },
        { answeredBy: { uid: "u1", name: "Priya" } },
      ],
    };
    assert.equal(getQuestionCTAState(q, "u1"), "self-answered");
  });
});

// ── version token (#215) — source analysis tests ──

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __qdDirname = dirname(fileURLToPath(import.meta.url));
const qdSource = readFileSync(join(__qdDirname, "QuestionDeck.jsx"), "utf-8");

describe("version token in QuestionDeck (#215)", () => {
  it("captures updatedAt millis as openQuestionsVersion on fetch", () => {
    // fetchData should store raw.updatedAt?.toMillis?.() as the version
    assert.ok(
      qdSource.includes("setOpenQuestionsVersion(raw.updatedAt?.toMillis?.() ?? null)"),
      "fetchData should capture updatedAt millis into openQuestionsVersion state"
    );
  });

  it("openQuestionsVersion state is initialized to null", () => {
    assert.ok(
      qdSource.includes("useState(null); // updatedAt millis (#215)"),
      "openQuestionsVersion should be initialized to null"
    );
  });

  it("injects version into oq object in handleConfirmRecord", () => {
    // handleConfirmRecord should pass version: openQuestionsVersion to onAnswerQuestion
    const confirmRecordMatch = qdSource.match(
      /const handleConfirmRecord\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)\n\s{2}\},/
    );
    assert.ok(confirmRecordMatch, "handleConfirmRecord callback should exist");
    const body = confirmRecordMatch[1];
    assert.ok(
      body.includes("version: openQuestionsVersion"),
      "handleConfirmRecord should inject version: openQuestionsVersion into onAnswerQuestion call"
    );
  });

  it("injects version into oq object in handleAnswerQuestion", () => {
    // handleAnswerQuestion should spread oq and add version: openQuestionsVersion
    const answerMatch = qdSource.match(
      /const handleAnswerQuestion\s*=\s*useCallback\(\(oq\)\s*=>\s*\{([\s\S]*?)\n\s{2}\},/
    );
    assert.ok(answerMatch, "handleAnswerQuestion callback should exist");
    const body = answerMatch[1];
    assert.ok(
      body.includes("...oq, version: openQuestionsVersion"),
      "handleAnswerQuestion should spread oq and add version: openQuestionsVersion"
    );
  });

  it("markAnswered uses version check inside transaction", () => {
    // The markAnswered callback should compare openQuestionsVersion against
    // the current doc version inside a runTransaction
    const markMatch = qdSource.match(
      /const markAnswered\s*=\s*useCallback\(async\s*\(area,\s*index\)\s*=>\s*\{([\s\S]*?)\n\s{2}\},/
    );
    assert.ok(markMatch, "markAnswered callback should exist");
    const body = markMatch[1];

    assert.ok(
      body.includes("runTransaction"),
      "markAnswered should use a Firestore transaction"
    );
    assert.ok(
      body.includes("currentVersion !== openQuestionsVersion"),
      "markAnswered should compare currentVersion against openQuestionsVersion"
    );
    assert.ok(
      body.includes("throw new Error('version-mismatch')"),
      "markAnswered should throw version-mismatch on stale version"
    );
  });

  it("handles version-mismatch error by refreshing data", () => {
    // When markAnswered catches version-mismatch, it should show error and refetch
    const markMatch = qdSource.match(
      /const markAnswered\s*=\s*useCallback\(async\s*\(area,\s*index\)\s*=>\s*\{([\s\S]*?)\n\s{2}\},/
    );
    const body = markMatch[1];

    assert.ok(
      body.includes("err.message === 'version-mismatch'"),
      "Should catch version-mismatch error"
    );
    assert.ok(
      body.includes("fetchData()"),
      "Should refetch data on version-mismatch"
    );
  });

  it("sets openQuestionsVersion to null when doc does not exist", () => {
    // When snap does not exist, version should be set to null
    assert.ok(
      qdSource.includes("setOpenQuestionsVersion(null)"),
      "Should set openQuestionsVersion to null when doc does not exist"
    );
  });
});

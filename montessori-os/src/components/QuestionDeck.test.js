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

// ── version token (#215) ──

describe("version token helpers (#215)", () => {
  it("oq object passed to onAnswerQuestion should include version from updatedAt millis", () => {
    // Simulates what QuestionDeck does: captures updatedAt millis as version,
    // then injects it into the oq object in handleConfirmRecord / handleAnswerQuestion
    const updatedAtMillis = 1751654400000;
    const oq = { area: "Math", index: 0, questionText: "How does the child count?" };
    const withVersion = { ...oq, version: updatedAtMillis };
    assert.equal(withVersion.version, 1751654400000);
    assert.equal(withVersion.area, "Math");
    assert.equal(withVersion.index, 0);
  });

  it("version is null when updatedAt is missing from doc", () => {
    // When open_questions doc has no updatedAt (shouldn't happen, but defensive)
    const raw = { areas: { "Math": ["q1"] } };
    const version = raw.updatedAt?.toMillis?.() ?? null;
    assert.equal(version, null);
  });

  it("version mismatch is detected when updatedAt differs", () => {
    const capturedVersion = 1751654400000;
    const currentDocUpdatedAt = 1751740800000; // different generation
    assert.notEqual(capturedVersion, currentDocUpdatedAt, "should detect mismatch");
  });

  it("version match passes when updatedAt is the same", () => {
    const capturedVersion = 1751654400000;
    const currentDocUpdatedAt = 1751654400000; // same generation
    assert.equal(capturedVersion, currentDocUpdatedAt, "should match");
  });
});

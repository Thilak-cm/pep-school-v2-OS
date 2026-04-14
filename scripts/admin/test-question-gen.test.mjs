/**
 * Tests for the question generation prototype (test-question-gen.mjs).
 *
 * Run: node --test scripts/admin/test-question-gen.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, buildUserPrompt, parseQuestionResponse } from "./test-question-gen.mjs";

// --- Fixtures ---

const SAMPLE_PROFILE_DIMS = [
  {
    dimensionKey: "mathematics",
    dimensionLabel: "Mathematics",
    narrative: "Shows interest in number work but rarely chooses math materials independently.",
    structuredSignals: { confidence: 0.3, evidenceCount: 4, trend: "emerging" },
  },
  {
    dimensionKey: "language_humanities",
    dimensionLabel: "Language & Humanities",
    narrative: "Strong reader, engages with chapter books and writes fluently in journals.",
    structuredSignals: { confidence: 0.85, evidenceCount: 18, trend: "stable" },
  },
  {
    dimensionKey: "sciences",
    dimensionLabel: "Sciences",
    narrative: "Participated in the plant growth experiment with enthusiasm.",
    structuredSignals: { confidence: 0.4, evidenceCount: 3, trend: "developing" },
  },
];

const SAMPLE_BASEBALL_CARD = {
  summary: "An expressive adolescent who thrives in language arts and group discussions. Shows emerging interest in science experiments. Math engagement is limited — tends to avoid number work unless prompted.",
  noteCount: 25,
  windowDays: 42,
  coverageGaps: ["mathematics", "technology_research"],
  status: "ok",
};

const SAMPLE_STUDENT_CONTEXT = {
  studentName: "Arjun S",
  dob: "2013-05-12",
  age: "13 years 0 months old",
  programId: "adolescent",
};

const VALID_LLM_RESPONSE = {
  questions: [
    { id: 1, text: "How often does Arjun choose math materials on his own?", type: "mcq", dimension: "mathematics", rationale: "Math confidence is 0.3 with only 4 observations.", options: ["Rarely — needs prompting", "Sometimes — once or twice a week", "Often — daily choice", "Frequently — seeks advanced challenges"] },
    { id: 2, text: "Can you describe a recent science project Arjun was involved in?", type: "open", dimension: "sciences", rationale: "Only 3 observations in sciences, need richer detail." },
    { id: 3, text: "What level of math work is Arjun currently engaging with?", type: "mcq", dimension: "mathematics", rationale: "Need to understand current math level.", options: ["Basic operations", "Fractions and decimals", "Pre-algebra concepts", "Algebra and beyond"] },
    { id: 4, text: "How does Arjun approach group science experiments?", type: "open", dimension: "sciences", rationale: "Only one experiment observed." },
    { id: 5, text: "What writing topics does Arjun gravitate toward?", type: "open", dimension: "language_humanities", rationale: "Confirming strength — high confidence but checking for evolution." },
    { id: 6, text: "How does Arjun handle math errors or frustration?", type: "open", dimension: "mathematics", rationale: "Emotional response to math challenges is unknown." },
    { id: 7, text: "Has Arjun shown interest in any technology or research projects?", type: "open", dimension: "sciences", rationale: "Baseball card notes technology_research as a coverage gap." },
  ],
  coverageReport: {
    dimensionsTargeted: ["mathematics", "sciences", "language_humanities"],
    dimensionsSkipped: [],
    gapsCovered: 2,
    gapsTotal: 2,
    reasoning: "Prioritized mathematics (confidence: 0.3) and sciences (confidence: 0.4) as weakest dimensions.",
  },
};

// --- Tests ---

describe("buildSystemPrompt", () => {
  it("includes role definition and output schema instructions", () => {
    const prompt = buildSystemPrompt(SAMPLE_PROFILE_DIMS);
    assert.ok(prompt.includes("interview questions"), "Should mention interview questions");
    assert.ok(prompt.includes("Montessori"), "Should reference Montessori context");
    assert.ok(prompt.includes('"questions"'), "Should include output schema for questions array");
    assert.ok(prompt.includes('"coverageReport"'), "Should include output schema for coverage report");
    assert.ok(prompt.includes("JSON"), "Should instruct JSON output");
  });

  it("includes all dimension keys in the prompt", () => {
    const prompt = buildSystemPrompt(SAMPLE_PROFILE_DIMS);
    for (const dim of SAMPLE_PROFILE_DIMS) {
      assert.ok(prompt.includes(dim.dimensionKey), `Should include dimension key: ${dim.dimensionKey}`);
      assert.ok(prompt.includes(dim.dimensionLabel), `Should include dimension label: ${dim.dimensionLabel}`);
    }
  });

  it("specifies question count of 7", () => {
    const prompt = buildSystemPrompt(SAMPLE_PROFILE_DIMS);
    assert.ok(prompt.includes("7"), "Should specify 7 questions");
  });

  it("specifies MCQ and open-ended types", () => {
    const prompt = buildSystemPrompt(SAMPLE_PROFILE_DIMS);
    assert.ok(prompt.includes("mcq"), "Should mention mcq type");
    assert.ok(prompt.includes("open"), "Should mention open type");
  });
});

describe("buildUserPrompt", () => {
  it("includes student context", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_PROFILE_DIMS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("Arjun"), "Should include student name");
    assert.ok(prompt.includes("adolescent"), "Should include program");
    assert.ok(prompt.includes("13 years"), "Should include age");
  });

  it("includes profile dimension data with signals", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_PROFILE_DIMS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("0.3"), "Should include math confidence value");
    assert.ok(prompt.includes("emerging"), "Should include trend");
    assert.ok(prompt.includes("Mathematics"), "Should include dimension label");
  });

  it("includes baseball card summary", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_PROFILE_DIMS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("expressive adolescent"), "Should include baseball card summary text");
    assert.ok(prompt.includes("42"), "Should include baseball card window days");
  });

  it("handles missing baseball card gracefully", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_PROFILE_DIMS, null);
    assert.ok(prompt.includes("Arjun"), "Should still include student context");
    assert.ok(prompt.includes("Mathematics"), "Should still include dimensions");
    assert.ok(prompt.includes("not available") || prompt.includes("No baseball card"), "Should note missing baseball card");
  });
});

describe("parseQuestionResponse", () => {
  const dimKeys = SAMPLE_PROFILE_DIMS.map((d) => d.dimensionKey);

  it("returns valid parsed output for well-formed response", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), dimKeys);
    assert.equal(result.questions.length, 7);
    assert.ok(result.coverageReport);
    assert.ok(Array.isArray(result.coverageReport.dimensionsTargeted));
  });

  it("validates question schema fields", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), dimKeys);
    for (const q of result.questions) {
      assert.ok(typeof q.id === "number", "id should be number");
      assert.ok(typeof q.text === "string" && q.text.length > 0, "text should be non-empty string");
      assert.ok(q.type === "mcq" || q.type === "open", `type should be mcq or open, got: ${q.type}`);
      assert.ok(typeof q.dimension === "string", "dimension should be string");
      assert.ok(typeof q.rationale === "string", "rationale should be string");
      if (q.type === "mcq") {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, "MCQ should have at least 2 options");
      }
    }
  });

  it("validates coverage report fields", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), dimKeys);
    const cr = result.coverageReport;
    assert.ok(Array.isArray(cr.dimensionsTargeted), "dimensionsTargeted should be array");
    assert.ok(Array.isArray(cr.dimensionsSkipped), "dimensionsSkipped should be array");
    assert.ok(typeof cr.gapsCovered === "number", "gapsCovered should be number");
    assert.ok(typeof cr.gapsTotal === "number", "gapsTotal should be number");
    assert.ok(typeof cr.reasoning === "string" && cr.reasoning.length > 0, "reasoning should be non-empty string");
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseQuestionResponse("not json", dimKeys), /Failed to parse/);
  });

  it("throws when questions array is missing", () => {
    assert.throws(
      () => parseQuestionResponse(JSON.stringify({ coverageReport: {} }), dimKeys),
      /must contain a "questions" array/,
    );
  });

  it("warns but does not throw for unknown dimension keys", () => {
    const modified = JSON.parse(JSON.stringify(VALID_LLM_RESPONSE));
    modified.questions[0].dimension = "unknown_dimension";
    const result = parseQuestionResponse(JSON.stringify(modified), dimKeys);
    assert.ok(result.warnings.length > 0, "Should have warnings for unknown dimension");
  });
});

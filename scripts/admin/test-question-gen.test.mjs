/**
 * Tests for the interview agent core helpers (interview-agent-core.mjs).
 *
 * Validates soul-based prompting: the prototype reads soul narrative +
 * guidelines markdown + recent interviews + baseball card (not old profile
 * dimensions) and generates targeted interview questions.
 *
 * Run: node --test scripts/admin/test-question-gen.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, buildUserPrompt, parseTurnResponse, parseQuestionResponse } from "./interview-agent-core.mjs";

// --- Fixtures ---

const SAMPLE_SOUL = `## Academic Development
Arjun shows a deep affinity for language arts — he reads chapter books independently and writes fluently in his journal. His engagement with mathematics is limited; he tends to avoid number work unless prompted by a guide. When encouraged, he can complete operations with fractions but rarely seeks advanced challenges on his own.

## Social-Emotional Growth
He is a natural leader in group discussions, often mediating when peers disagree. His emotional regulation is strong in familiar settings but can falter during transitions or unexpected schedule changes.

## Sciences & Exploration
Participated enthusiastically in the plant growth experiment. Shows curiosity about biological systems but has limited exposure to physical sciences or technology projects.

## Areas Needing Further Exploration
- Mathematics engagement and independent work habits (only 4 observations, all guide-prompted)
- Physical sciences and technology (no observations)
- Behaviour during unstructured free periods`;

const SAMPLE_GUIDELINES = `## Language & Humanities
### Reading Comprehension
- Reads age-appropriate chapter books independently
- Demonstrates literal and inferential comprehension
- Can summarise main ideas and supporting details

### Written Expression
- Writes multi-paragraph compositions with clear structure
- Uses varied sentence structures and vocabulary
- Edits own work for clarity and conventions

## Mathematics
### Number Operations
- Performs operations with fractions and decimals fluently
- Applies order of operations correctly
- Solves multi-step word problems independently

### Algebraic Thinking
- Identifies and extends patterns
- Uses variables to represent unknown quantities
- Solves simple equations

## Sciences & Technology
### Scientific Inquiry
- Designs simple experiments with controls
- Records observations systematically
- Draws evidence-based conclusions

### Technology & Research
- Uses research tools to investigate questions
- Presents findings in organised formats

## Social-Emotional Development
### Self-Regulation
- Manages emotions during transitions
- Seeks appropriate support when overwhelmed
- Demonstrates resilience after setbacks

### Social Leadership
- Mediates peer conflicts constructively
- Includes others in group activities
- Takes initiative in collaborative projects`;

const SAMPLE_INTERVIEWS = [
  {
    teacherName: "Priya R",
    conductedAt: "2026-04-20T10:30:00.000Z",
    status: "completed",
    areasCovered: ["Language & Humanities", "Social-Emotional Development"],
    exchanges: [
      { questionId: 1, questionText: "How does Arjun approach his daily reading time?", questionType: "open", area: "Language & Humanities", responseText: "He immediately picks up his book and reads for the full 30 minutes. Sometimes he asks to continue during work period." },
      { questionId: 2, questionText: "How does Arjun handle disagreements with peers?", questionType: "open", area: "Social-Emotional Development", responseText: "He usually stays calm and tries to find a compromise. He's good at hearing both sides." },
    ],
  },
];

const SAMPLE_BASEBALL_CARD = {
  summary: "An expressive adolescent who thrives in language arts and group discussions. Shows emerging interest in science experiments. Math engagement is limited — tends to avoid number work unless prompted.",
  noteCount: 25,
  windowDays: 42,
  coverageGaps: ["Mathematics", "Sciences & Technology"],
  status: "ok",
};

const SAMPLE_STUDENT_CONTEXT = {
  studentName: "Arjun S",
  age: "13y 0m",
  programId: "adolescent",
};

// Extract expected areas from guidelines (## headers)
const GUIDELINES_AREAS = [
  "Language & Humanities",
  "Mathematics",
  "Sciences & Technology",
  "Social-Emotional Development",
];

// Turn-by-turn response fixtures (matches the actual system prompt output format)
const FIRST_TURN_RESPONSE = {
  explorationAreas: [
    { area: "Mathematics", rationale: "Only 4 observations, all guide-prompted — independent engagement is unknown" },
    { area: "Sciences & Technology", rationale: "No observations in physical sciences or technology projects" },
  ],
  question: {
    text: "When Arjun has free choice during work period, how often do you see him gravitate toward math materials on his own — and what does that look like?",
    type: "open",
    area: "Mathematics",
  },
};

const SUBSEQUENT_TURN_RESPONSE = {
  thinking: "Teacher says Arjun rarely chooses math independently. Follow up on what happens when he does engage — does he show competence or avoidance?",
  question: {
    text: "When Arjun does work with math materials, how does he handle challenges or errors?",
    type: "open",
    area: "Mathematics",
  },
};

// Batch response fixture (for parseQuestionResponse — offline evaluation format)
const VALID_LLM_RESPONSE = {
  questions: [
    { id: 1, text: "How often does Arjun choose math materials on his own during work period?", type: "mcq", area: "Mathematics", rationale: "Soul notes only 4 math observations, all guide-prompted. Need to assess independent engagement.", options: ["Rarely — needs prompting", "Sometimes — once or twice a week", "Often — daily choice", "Frequently — seeks advanced challenges"] },
    { id: 2, text: "Can you describe a recent science or technology project Arjun was involved in?", type: "open", area: "Sciences & Technology", rationale: "Soul identifies physical sciences and technology as having no observations." },
    { id: 3, text: "What level of math work is Arjun currently engaging with when he does choose it?", type: "mcq", area: "Mathematics", rationale: "Guidelines specify fraction fluency and algebraic thinking — need to assess current level.", options: ["Basic operations review", "Fractions and decimals", "Pre-algebra concepts", "Algebra and beyond"] },
    { id: 4, text: "How does Arjun behave during unstructured free periods?", type: "open", area: "Social-Emotional Development", rationale: "Soul explicitly lists this as an area needing exploration." },
    { id: 5, text: "What kinds of writing topics does Arjun gravitate toward lately?", type: "open", area: "Language & Humanities", rationale: "High-confidence area but recent interview covered reading, not writing. Check for evolution." },
    { id: 6, text: "How does Arjun respond when he encounters difficulty in math?", type: "open", area: "Mathematics", rationale: "Emotional response to math challenges is unobserved — intersection of math and self-regulation." },
    { id: 7, text: "Has Arjun shown interest in using technology for research or presentations?", type: "open", area: "Sciences & Technology", rationale: "Guidelines include Technology & Research benchmarks with zero observations." },
  ],
  coverageReport: {
    areasCovered: ["Mathematics", "Sciences & Technology", "Social-Emotional Development", "Language & Humanities"],
    areasSkipped: [],
    gapsCovered: 3,
    gapsTotal: 3,
    reasoning: "Prioritised Mathematics (limited observations, all prompted) and Sciences & Technology (no observations in physical sciences/tech). Avoided re-asking Language & Humanities reading questions covered in recent Priya R interview.",
  },
};

// --- Tests ---

describe("buildSystemPrompt", () => {
  it("includes role definition and JSON output schema", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(prompt.includes("interview"), "Should mention interview");
    assert.ok(prompt.includes("Montessori"), "Should reference Montessori context");
    assert.ok(prompt.includes('"question"'), "Should include output schema for question object");
    assert.ok(prompt.includes("JSON"), "Should instruct JSON output");
  });

  it("includes guidelines areas (## headers) in the prompt", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    for (const area of GUIDELINES_AREAS) {
      assert.ok(prompt.includes(area), `Should include guidelines area: ${area}`);
    }
  });

  it("references soul narrative as context source", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(prompt.includes("soul") || prompt.includes("narrative"), "Should reference soul/narrative as input");
  });

  it("instructs area-based targeting (not dimension keys)", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(prompt.includes("area"), "Should use 'area' terminology");
    assert.ok(!prompt.includes("dimensionKey"), "Should NOT reference dimensionKey");
    assert.ok(!prompt.includes("dimension_key"), "Should NOT reference dimension_key");
  });

  it("specifies open-only questions with pushback for vague answers", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(prompt.includes("open"), "Should mention open type");
    assert.ok(prompt.includes("NEVER fall back to multiple-choice"), "Should instruct against MCQ fallback");
    assert.ok(prompt.includes("Rephrase"), "Should instruct rephrasing for vague answers");
  });

  it("includes open questions bank when provided", () => {
    const questions = ["How does Arjun handle frustration?", "What does independent work look like for him?"];
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT, questions);
    assert.ok(prompt.includes("OPEN QUESTIONS BANK"), "Should include questions bank header");
    assert.ok(prompt.includes("How does Arjun handle frustration?"), "Should include question text");
    assert.ok(prompt.includes("2 pre-generated"), "Should show question count");
  });

  it("omits open questions bank when not provided", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(!prompt.includes("OPEN QUESTIONS BANK"), "Should not include questions bank when empty");
  });

  it("instructs avoiding recently covered areas from prior interviews", () => {
    const prompt = buildSystemPrompt(SAMPLE_GUIDELINES, SAMPLE_SOUL, SAMPLE_BASEBALL_CARD, SAMPLE_STUDENT_CONTEXT);
    assert.ok(
      prompt.includes("recent") || prompt.includes("already") || prompt.includes("avoid"),
      "Should instruct deduplication against recent interviews"
    );
  });
});

describe("buildUserPrompt", () => {
  it("includes student context", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("Arjun"), "Should include student name");
    assert.ok(prompt.includes("adolescent"), "Should include program");
    assert.ok(prompt.includes("13y"), "Should include age");
  });

  it("includes soul narrative content", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("deep affinity for language arts"), "Should include soul narrative text");
    assert.ok(prompt.includes("Areas Needing Further Exploration"), "Should include gaps section");
  });

  it("includes guidelines content", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("Reading Comprehension"), "Should include guidelines skill areas");
    assert.ok(prompt.includes("Algebraic Thinking"), "Should include guidelines benchmarks");
  });

  it("includes recent interview summaries", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("Priya R"), "Should include interviewer name");
    assert.ok(prompt.includes("reading time"), "Should include interview exchange content");
  });

  it("includes baseball card summary", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("expressive adolescent"), "Should include baseball card summary");
    assert.ok(prompt.includes("42"), "Should include window days");
  });

  it("handles missing baseball card gracefully", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, SAMPLE_INTERVIEWS, null);
    assert.ok(prompt.includes("Arjun"), "Should still include student context");
    assert.ok(prompt.includes("deep affinity"), "Should still include soul");
    assert.ok(prompt.includes("No baseball card") || prompt.includes("not available"), "Should note missing baseball card");
  });

  it("handles empty interviews array", () => {
    const prompt = buildUserPrompt(SAMPLE_STUDENT_CONTEXT, SAMPLE_SOUL, SAMPLE_GUIDELINES, [], SAMPLE_BASEBALL_CARD);
    assert.ok(prompt.includes("Arjun"), "Should still include student context");
    assert.ok(prompt.includes("No recent interviews") || !prompt.includes("Priya"), "Should handle no interviews");
  });
});

describe("parseQuestionResponse", () => {
  it("returns valid parsed output for well-formed response", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), GUIDELINES_AREAS);
    assert.equal(result.questions.length, 7);
    assert.ok(result.coverageReport);
    assert.ok(Array.isArray(result.coverageReport.areasCovered));
  });

  it("validates question schema fields", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), GUIDELINES_AREAS);
    for (const q of result.questions) {
      assert.ok(typeof q.id === "number", "id should be number");
      assert.ok(typeof q.text === "string" && q.text.length > 0, "text should be non-empty string");
      assert.ok(q.type === "mcq" || q.type === "open", `type should be mcq or open, got: ${q.type}`);
      assert.ok(typeof q.area === "string", "area should be string");
      assert.ok(typeof q.rationale === "string", "rationale should be string");
      if (q.type === "mcq") {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, "MCQ should have at least 2 options");
      }
      if (q.type === "open") {
        assert.equal(q.options, undefined, "Open questions should not have options");
      }
    }
  });

  it("strips spurious options from open-ended questions", () => {
    const modified = JSON.parse(JSON.stringify(VALID_LLM_RESPONSE));
    modified.questions[1].options = ["Option A", "Option B"];
    const result = parseQuestionResponse(JSON.stringify(modified), GUIDELINES_AREAS);
    const openQ = result.questions.find((q) => q.type === "open");
    assert.equal(openQ.options, undefined, "Parser should strip options from open questions");
  });

  it("validates area against guidelines areas", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), GUIDELINES_AREAS);
    assert.equal(result.warnings.length, 0, "Valid areas should produce no warnings");
  });

  it("warns for unknown area not in guidelines", () => {
    const modified = JSON.parse(JSON.stringify(VALID_LLM_RESPONSE));
    modified.questions[0].area = "Cosmic Education";
    const result = parseQuestionResponse(JSON.stringify(modified), GUIDELINES_AREAS);
    assert.ok(result.warnings.length > 0, "Should warn for unknown area");
    assert.ok(result.warnings[0].includes("Cosmic Education"), "Warning should name the unknown area");
  });

  it("validates coverage report fields", () => {
    const result = parseQuestionResponse(JSON.stringify(VALID_LLM_RESPONSE), GUIDELINES_AREAS);
    const cr = result.coverageReport;
    assert.ok(Array.isArray(cr.areasCovered), "areasCovered should be array");
    assert.ok(Array.isArray(cr.areasSkipped), "areasSkipped should be array");
    assert.ok(typeof cr.gapsCovered === "number", "gapsCovered should be number");
    assert.ok(typeof cr.gapsTotal === "number", "gapsTotal should be number");
    assert.ok(typeof cr.reasoning === "string" && cr.reasoning.length > 0, "reasoning should be non-empty string");
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseQuestionResponse("not json", GUIDELINES_AREAS), /Failed to parse/);
  });

  it("throws when questions array is missing", () => {
    assert.throws(
      () => parseQuestionResponse(JSON.stringify({ coverageReport: {} }), GUIDELINES_AREAS),
      /must contain a "questions" array/,
    );
  });
});

describe("parseTurnResponse", () => {
  it("parses a valid first-turn response with explorationAreas", () => {
    const result = parseTurnResponse(JSON.stringify(FIRST_TURN_RESPONSE), GUIDELINES_AREAS);
    assert.ok(result.question, "Should have a question object");
    assert.equal(result.question.text.length > 0, true, "Question text should be non-empty");
    assert.equal(result.question.type, "open");
    assert.equal(result.question.area, "Mathematics");
    assert.ok(Array.isArray(result.explorationAreas), "Should have explorationAreas on first turn");
    assert.equal(result.explorationAreas.length, 2);
    assert.equal(result.thinking, null, "First turn should not have thinking");
    assert.equal(result.warnings.length, 0);
  });

  it("parses a valid subsequent-turn response with thinking", () => {
    const result = parseTurnResponse(JSON.stringify(SUBSEQUENT_TURN_RESPONSE), GUIDELINES_AREAS);
    assert.ok(result.question, "Should have a question object");
    assert.equal(result.question.type, "open");
    assert.equal(result.question.options, undefined, "Open question should not have options");
    assert.ok(result.thinking, "Subsequent turn should have thinking");
    assert.equal(result.explorationAreas, null, "Subsequent turn should not have explorationAreas");
    assert.equal(result.warnings.length, 0);
  });

  it("warns for unknown area", () => {
    const modified = { ...FIRST_TURN_RESPONSE, question: { ...FIRST_TURN_RESPONSE.question, area: "Cosmic Education" } };
    const result = parseTurnResponse(JSON.stringify(modified), GUIDELINES_AREAS);
    assert.ok(result.warnings.length > 0, "Should warn for unknown area");
    assert.ok(result.warnings[0].includes("Cosmic Education"));
  });

  it("strips spurious options from open questions", () => {
    const modified = { ...SUBSEQUENT_TURN_RESPONSE, question: { ...SUBSEQUENT_TURN_RESPONSE.question, options: ["A", "B"] } };
    const result = parseTurnResponse(JSON.stringify(modified), GUIDELINES_AREAS);
    assert.equal(result.question.options, undefined, "Should strip options from open questions");
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseTurnResponse("not json", GUIDELINES_AREAS), /Failed to parse/);
  });

  it("throws when question object is missing", () => {
    assert.throws(
      () => parseTurnResponse(JSON.stringify({ thinking: "hmm" }), GUIDELINES_AREAS),
      /must contain a "question" object/,
    );
  });
});

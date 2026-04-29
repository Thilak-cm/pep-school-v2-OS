import test from "node:test";
import assert from "node:assert/strict";
import { FRONTIER_MODEL } from "../config/modelConstants.js";

// ---------------------------------------------------------------------------
// Soul model constants
// ---------------------------------------------------------------------------

test("SOUL_DEFAULTS.model is the frontier model", async () => {
  const { SOUL_DEFAULTS } = await import("../utils/soulHelpers.js");
  assert.equal(SOUL_DEFAULTS.model, FRONTIER_MODEL, "SOUL_DEFAULTS.model must match FRONTIER_MODEL");
  assert.ok(!SOUL_DEFAULTS.model.includes("mini"), "SOUL_DEFAULTS.model should not be a mini model");
  assert.ok(!SOUL_DEFAULTS.model.includes("nano"), "SOUL_DEFAULTS.model should not be a nano model");
});

test("SOUL_DEFAULTS has expected shape", async () => {
  const { SOUL_DEFAULTS } = await import("../utils/soulHelpers.js");
  assert.ok(SOUL_DEFAULTS.model, "model required");
  assert.equal(typeof SOUL_DEFAULTS.temperature, "number");
  assert.equal(typeof SOUL_DEFAULTS.max_tokens, "number");
  assert.equal(SOUL_DEFAULTS.temperature, 0, "soul generation should use temperature 0");
});

test("VALID_PROGRAMS covers all four programs", async () => {
  const { VALID_PROGRAMS } = await import("../utils/soulHelpers.js");
  assert.deepStrictEqual([...VALID_PROGRAMS].sort(), ["adolescent", "elementary", "primary", "toddler"]);
});

// ---------------------------------------------------------------------------
// buildSoulSystemPrompt
// ---------------------------------------------------------------------------

test("buildSoulSystemPrompt includes guidelines content", async () => {
  const { buildSoulSystemPrompt } = await import("../utils/soulHelpers.js");
  const guidelines = "## Mathematics\n### Algebra\n- Solves equations";
  const prompt = buildSoulSystemPrompt(guidelines);

  assert.ok(prompt.includes("## Mathematics"), "should include guidelines content");
  assert.ok(prompt.includes("Solves equations"), "should include benchmark text");
  assert.ok(prompt.includes("markdown"), "should instruct markdown output");
});

test("buildSoulSystemPrompt instructs stability from previous soul", async () => {
  const { buildSoulSystemPrompt } = await import("../utils/soulHelpers.js");
  const prompt = buildSoulSystemPrompt("## Test");

  assert.ok(
    prompt.toLowerCase().includes("stability") || prompt.toLowerCase().includes("continuity") || prompt.toLowerCase().includes("previous"),
    "should reference continuity/stability with previous soul",
  );
});

// ---------------------------------------------------------------------------
// buildSoulUserPrompt
// ---------------------------------------------------------------------------

test("buildSoulUserPrompt includes student context and observations", async () => {
  const { buildSoulUserPrompt } = await import("../utils/soulHelpers.js");
  const studentContext = { studentName: "Aria", age: "5 years", programId: "primary" };
  const observations = [{ type: "text", text: "Aria chose the bead chain today" }];

  const prompt = buildSoulUserPrompt(studentContext, observations, [], null);
  assert.ok(prompt.includes("Aria"), "should include student name");
  assert.ok(prompt.includes("bead chain"), "should include observation text");
});

test("buildSoulUserPrompt includes interviews when present", async () => {
  const { buildSoulUserPrompt } = await import("../utils/soulHelpers.js");
  const studentContext = { studentName: "Aria", age: "5 years", programId: "primary" };
  const interviews = [{ teacherName: "Ms. Smith", exchanges: [{ questionText: "How is Aria's reading?" }] }];

  const prompt = buildSoulUserPrompt(studentContext, [], interviews, null);
  assert.ok(prompt.includes("interview") || prompt.includes("Interview"), "should reference interviews");
  assert.ok(prompt.includes("Ms. Smith") || prompt.includes("reading"), "should include interview content");
});

test("buildSoulUserPrompt includes previous soul for continuity", async () => {
  const { buildSoulUserPrompt } = await import("../utils/soulHelpers.js");
  const studentContext = { studentName: "Aria", age: "5 years", programId: "primary" };
  const previousSoul = "## Social-Emotional\nAria has strong peer relationships.";

  const prompt = buildSoulUserPrompt(studentContext, [], [], previousSoul);
  assert.ok(prompt.includes("peer relationships"), "should include previous soul content");
});

test("buildSoulUserPrompt works without previous soul", async () => {
  const { buildSoulUserPrompt } = await import("../utils/soulHelpers.js");
  const studentContext = { studentName: "Aria", age: "5 years", programId: "primary" };

  const prompt = buildSoulUserPrompt(studentContext, [], [], null);
  assert.ok(typeof prompt === "string" && prompt.length > 0, "should return valid string");
});

// ---------------------------------------------------------------------------
// parseSoulResponse
// ---------------------------------------------------------------------------

test("parseSoulResponse accepts valid markdown string", async () => {
  const { parseSoulResponse } = await import("../utils/soulHelpers.js");
  const content = "## Social-Emotional\nAria shows empathy.\n\n## Mathematics\nEarly number sense.";
  const result = parseSoulResponse(content);
  assert.equal(result, content, "should return the content as-is");
});

test("parseSoulResponse trims whitespace", async () => {
  const { parseSoulResponse } = await import("../utils/soulHelpers.js");
  const result = parseSoulResponse("  ## Test  \n\n");
  assert.equal(result, "## Test", "should trim whitespace");
});

test("parseSoulResponse throws on empty content", async () => {
  const { parseSoulResponse } = await import("../utils/soulHelpers.js");
  assert.throws(() => parseSoulResponse(""), /empty/i, "should throw on empty string");
  assert.throws(() => parseSoulResponse("   "), /empty/i, "should throw on whitespace-only");
  assert.throws(() => parseSoulResponse(null), /empty/i, "should throw on null");
});

// ---------------------------------------------------------------------------
// buildSoulDoc
// ---------------------------------------------------------------------------

test("buildSoulDoc returns correct shape", async () => {
  const { buildSoulDoc } = await import("../utils/soulHelpers.js");
  const doc = buildSoulDoc({
    content: "## Test\nNarrative here.",
    programId: "primary",
    observationCount: 42,
    interviewCount: 3,
    lastObservationAt: new Date("2026-04-01"),
    lastInterviewAt: new Date("2026-04-10"),
  });

  assert.equal(doc.content, "## Test\nNarrative here.");
  assert.equal(doc.programId, "primary");
  assert.equal(doc.updatedBy, "cloud-function:soul-generate");
  assert.equal(doc.sourceStats.observationCount, 42);
  assert.equal(doc.sourceStats.interviewCount, 3);
  assert.ok(doc.sourceStats.lastGeneratedAt, "should have lastGeneratedAt");
});

test("buildSoulDoc handles zero observations and interviews", async () => {
  const { buildSoulDoc } = await import("../utils/soulHelpers.js");
  const doc = buildSoulDoc({
    content: "No data.",
    programId: "toddler",
    observationCount: 0,
    interviewCount: 0,
    lastObservationAt: null,
    lastInterviewAt: null,
  });

  assert.equal(doc.sourceStats.observationCount, 0);
  assert.equal(doc.sourceStats.interviewCount, 0);
  assert.equal(doc.sourceStats.lastObservationAt, null);
  assert.equal(doc.sourceStats.lastInterviewAt, null);
});

// ---------------------------------------------------------------------------
// buildGuidelinesDoc
// ---------------------------------------------------------------------------

test("buildGuidelinesDoc returns correct shape", async () => {
  const { buildGuidelinesDoc } = await import("../utils/soulHelpers.js");
  const templateContent = "## Mathematics\n### Algebra\n- Solves equations";
  const doc = buildGuidelinesDoc({
    content: templateContent,
    programId: "adolescent",
    templateDocId: "config/soul_template_adolescent",
  });

  assert.equal(doc.content, templateContent);
  assert.equal(doc.programId, "adolescent");
  assert.equal(doc.seededFrom, "config/soul_template_adolescent");
  assert.equal(doc.updatedBy, "cloud-function:soul-generate");
});

// ---------------------------------------------------------------------------
// buildHistorySnapshot
// ---------------------------------------------------------------------------

test("buildHistorySnapshot captures previous state", async () => {
  const { buildHistorySnapshot } = await import("../utils/soulHelpers.js");
  const prevDoc = {
    content: "Old soul content",
    updatedAt: new Date("2026-04-15"),
    updatedBy: "cloud-function:soul-generate",
  };

  const snapshot = buildHistorySnapshot(prevDoc, "Weekly regeneration");
  assert.equal(snapshot.content, "Old soul content");
  assert.equal(snapshot.reason, "Weekly regeneration");
  assert.ok(snapshot.updatedAt, "should have updatedAt");
  assert.ok(snapshot.updatedBy, "should have updatedBy");
});

// ---------------------------------------------------------------------------
// hasEmergentObservations
// ---------------------------------------------------------------------------

test("hasEmergentObservations detects non-empty emergent section", async () => {
  const { hasEmergentObservations } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\nShows unusual interest in insects.";
  assert.equal(hasEmergentObservations(soul), true);
});

test("hasEmergentObservations returns false for empty emergent section", async () => {
  const { hasEmergentObservations } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\n";
  assert.equal(hasEmergentObservations(soul), false);
});

test("hasEmergentObservations returns false when no emergent section", async () => {
  const { hasEmergentObservations } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Social\nFine.";
  assert.equal(hasEmergentObservations(soul), false);
});

// ---------------------------------------------------------------------------
// extractGuidelinesSuggestions (combined extract + strip) (PEP-173)
// ---------------------------------------------------------------------------

test("extractGuidelinesSuggestions parses YAML block and returns cleaned content", async () => {
  const { extractGuidelinesSuggestions } = await import("../utils/soulHelpers.js");
  const soul = `## Emergent Observations

Shows interest in insects.

\`\`\`yaml
guidelines_suggestions:
  - area: "Kinesthetic & Maker Learning"
    discipline: "Health & Wellbeing"
    rationale: "Repeated pattern across science and enterprise"
  - area: "Competitive Sport & Identity"
    discipline: "Health & Wellbeing"
    rationale: "Cricket central to self-concept"
\`\`\``;

  const { suggestions, content } = extractGuidelinesSuggestions(soul);
  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].area, "Kinesthetic & Maker Learning");
  assert.equal(suggestions[0].discipline, "Health & Wellbeing");
  assert.ok(suggestions[0].rationale.includes("science"));
  assert.equal(suggestions[1].area, "Competitive Sport & Identity");
  assert.ok(!content.includes("```yaml"), "YAML block should be removed from content");
  assert.ok(content.includes("Shows interest in insects"), "narrative should be preserved");
});

test("extractGuidelinesSuggestions returns empty suggestions and unchanged content when no YAML block", async () => {
  const { extractGuidelinesSuggestions } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\nSome text.";
  const { suggestions, content } = extractGuidelinesSuggestions(soul);
  assert.deepStrictEqual(suggestions, []);
  assert.equal(content, soul);
});

// ---------------------------------------------------------------------------
// extractOpenQuestions (PEP-173)
// ---------------------------------------------------------------------------

test("extractOpenQuestions parses fenced block and returns cleaned content", async () => {
  const { extractOpenQuestions } = await import("../utils/soulHelpers.js");
  const soul = `## Mathematics
Good progress.

## Areas Needing Further Exploration
Social-emotional gaps.

\`\`\`open_questions
1. How does the child respond when frustrated during group work?
2. What types of reading material does the child choose independently?
3. Has the child shown interest in measurement activities?
\`\`\``;

  const { questions, content } = extractOpenQuestions(soul);
  assert.equal(questions.length, 3);
  assert.ok(questions[0].includes("frustrated during group work"));
  assert.ok(questions[1].includes("reading material"));
  assert.ok(questions[2].includes("measurement activities"));
  assert.ok(!content.includes("```open_questions"), "fenced block should be removed from content");
  assert.ok(content.includes("Social-emotional gaps"), "narrative should be preserved");
  assert.ok(content.includes("## Mathematics"), "other sections preserved");
});

test("extractOpenQuestions returns empty array when no block present", async () => {
  const { extractOpenQuestions } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\nSome text.";
  const { questions, content } = extractOpenQuestions(soul);
  assert.deepStrictEqual(questions, []);
  assert.equal(content, soul);
});

test("extractOpenQuestions handles empty fenced block", async () => {
  const { extractOpenQuestions } = await import("../utils/soulHelpers.js");
  const soul = `## Mathematics\nGood.\n\n\`\`\`open_questions\n\`\`\``;
  const { questions, content } = extractOpenQuestions(soul);
  assert.deepStrictEqual(questions, []);
  assert.ok(!content.includes("```open_questions"));
});

test("extractOpenQuestions strips numbering prefixes from questions", async () => {
  const { extractOpenQuestions } = await import("../utils/soulHelpers.js");
  const soul = `## Test\n\n\`\`\`open_questions\n1. First question?\n2. Second question?\n- Third question?\n\`\`\``;
  const { questions } = extractOpenQuestions(soul);
  assert.equal(questions.length, 3);
  assert.equal(questions[0], "First question?");
  assert.equal(questions[1], "Second question?");
  assert.equal(questions[2], "Third question?");
});

test("extractOpenQuestions coexists with guidelines_suggestions YAML block", async () => {
  const { extractOpenQuestions, extractGuidelinesSuggestions } = await import("../utils/soulHelpers.js");
  const soul = `## Mathematics
Good.

\`\`\`yaml
guidelines_suggestions:
  - area: "Test Area"
    discipline: "Test Discipline"
    rationale: "Test Rationale"
\`\`\`

\`\`\`open_questions
1. How does the child handle peer conflict?
2. What is their approach to multi-step math problems?
\`\`\``;

  const oq = extractOpenQuestions(soul);
  assert.equal(oq.questions.length, 2);
  assert.ok(oq.content.includes("```yaml"), "guidelines YAML block should NOT be removed by extractOpenQuestions");

  const gs = extractGuidelinesSuggestions(soul);
  assert.equal(gs.suggestions.length, 1);
  assert.ok(gs.content.includes("```open_questions"), "open_questions block should NOT be removed by extractGuidelinesSuggestions");
});

// ---------------------------------------------------------------------------
// buildOpenQuestionsDoc (PEP-173)
// ---------------------------------------------------------------------------

test("buildOpenQuestionsDoc returns correct shape", async () => {
  const { buildOpenQuestionsDoc } = await import("../utils/soulHelpers.js");
  const questions = ["How does the child handle frustration?", "What reading materials do they choose?"];
  const doc = buildOpenQuestionsDoc({ questions, programId: "primary" });

  assert.deepStrictEqual(doc.questions, questions);
  assert.equal(doc.questionCount, 2);
  assert.equal(doc.programId, "primary");
  assert.equal(doc.updatedBy, "cloud-function:soul-generate");
});

test("buildOpenQuestionsDoc handles empty questions array", async () => {
  const { buildOpenQuestionsDoc } = await import("../utils/soulHelpers.js");
  const doc = buildOpenQuestionsDoc({ questions: [], programId: "toddler" });

  assert.deepStrictEqual(doc.questions, []);
  assert.equal(doc.questionCount, 0);
});

// ---------------------------------------------------------------------------
// hasInformationGaps (PEP-162)
// ---------------------------------------------------------------------------

test("hasInformationGaps detects non-empty gaps section", async () => {
  const { hasInformationGaps } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\nInsects.\n\n## Areas Needing Further Exploration\nSocial-emotional development has only one observation from a single teacher.";
  assert.equal(hasInformationGaps(soul), true);
});

test("hasInformationGaps returns false for empty gaps section", async () => {
  const { hasInformationGaps } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Areas Needing Further Exploration\n";
  assert.equal(hasInformationGaps(soul), false);
});

test("hasInformationGaps returns false when no gaps section", async () => {
  const { hasInformationGaps } = await import("../utils/soulHelpers.js");
  const soul = "## Mathematics\nGood.\n\n## Emergent Observations\nSome text.";
  assert.equal(hasInformationGaps(soul), false);
});

test("buildSoulSystemPrompt includes gaps instruction", async () => {
  const { buildSoulSystemPrompt } = await import("../utils/soulHelpers.js");
  const prompt = buildSoulSystemPrompt("## Test Guidelines");
  assert.ok(
    prompt.includes("Areas Needing Further Exploration"),
    "should instruct LLM to produce an Areas Needing Further Exploration section",
  );
});

test("buildSoulSystemPrompt includes open_questions instruction (PEP-173)", async () => {
  const { buildSoulSystemPrompt } = await import("../utils/soulHelpers.js");
  const prompt = buildSoulSystemPrompt("## Test Guidelines");
  assert.ok(
    prompt.includes("open_questions"),
    "should instruct LLM to produce an open_questions fenced block",
  );
  assert.ok(
    prompt.includes("```open_questions"),
    "should include the fenced block format example",
  );
});

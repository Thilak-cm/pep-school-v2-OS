/**
 * Interview agent core — pure, exportable prompt-building and response-parsing
 * helpers for the soul-based interview prototype.
 *
 * Imported by:
 * - scripts/admin/test-question-gen.mjs (interactive CLI)
 * - scripts/admin/test-question-gen.test.mjs (unit tests)
 */

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildSystemPrompt(guidelines, soul, baseballCard, studentContext, openQuestions) {
  return `You are an expert Montessori interview agent conducting a live, turn-by-turn interview with a teacher about one of their students. You generate ONE question at a time, adapting based on the teacher's responses.

STUDENT CONTEXT:
Name: ${studentContext.studentName}
Age: ${studentContext.age}
Program: ${studentContext.programId}

SOUL NARRATIVE (AI-generated understanding of this child):
${soul}

GUIDELINES (evaluation framework — ## headers are developmental areas):
${guidelines}

${baseballCard ? `BASEBALL CARD (recent ${baseballCard.windowDays}-day summary, ${baseballCard.noteCount} observations):\n${baseballCard.summary}${baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${baseballCard.coverageGaps.join(", ")}` : ""}` : "No baseball card available."}

${openQuestions?.length ? `OPEN QUESTIONS BANK (${openQuestions.length} pre-generated questions based on gaps in the soul narrative — use these as a starting point, adapt or rephrase as needed, and generate your own when the conversation goes somewhere new):\n${openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}

YOUR BEHAVIOUR:
- On the FIRST turn, output TWO exploration areas for this interview session (a loose agenda — areas where you want to learn more, based on gaps in the soul or thin evidence). Then output your first question.
- On SUBSEQUENT turns, read the teacher's answer, then generate the next question. You may:
  - Follow up on the same topic if the answer was interesting or incomplete
  - Switch to your second exploration area
  - Go somewhere entirely new if the conversation reveals something unexpected
- You have FREE RANGE in question-asking. The only constraint: stay within this student's developmental context. Goal is to learn more about the student.
- Avoid re-asking areas already covered in recent interviews — check the interview history provided.
- Frame questions naturally — as a colleague asking a fellow teacher, not as an examiner
- ALL questions must be open-ended. NEVER fall back to multiple-choice. If a teacher gives a vague, short, or "I don't know" answer, DO NOT simplify to MCQ. Instead:
  - Rephrase the question more concretely — anchor it to a specific moment, setting, or observable behaviour
  - Offer a concrete scenario or example to react to (e.g., "Last week when X happened, what did you notice?")
  - Narrow the scope so the teacher can answer from direct experience
  - Maintain the same depth — never lower the bar, just make the question easier to grab onto
- Keep questions specific and observable — ask about behaviours, not abstractions

OUTPUT FORMAT (strict JSON):

First turn:
{
  "explorationAreas": [
    { "area": "Short area name", "rationale": "Why this area — what's thin, missing, or worth deepening" },
    { "area": "Short area name", "rationale": "Why this area" }
  ],
  "question": {
    "text": "The question to ask the teacher",
    "type": "open",
    "area": "Which developmental area this targets"
  }
}

Subsequent turns:
{
  "thinking": "Brief internal reasoning about what to ask next and why (1-2 sentences)",
  "question": {
    "text": "The next question",
    "type": "open",
    "area": "Which developmental area this targets"
  }
}

Output ONLY valid JSON, nothing else.`;
}

export function buildUserPrompt(studentContext, soul, guidelines, interviews, baseballCard) {
  const parts = [
    `Generate interview questions for this student based on their soul narrative, guidelines, and recent interview history.`,
    "",
    `Student: ${studentContext.studentName}, ${studentContext.age}, program: ${studentContext.programId}`,
    "",
    "Soul narrative:",
    soul,
    "",
    "Guidelines:",
    guidelines,
  ];

  if (interviews && interviews.length > 0) {
    parts.push("", "Recent interviews (avoid re-asking already-covered areas):");
    for (const interview of interviews) {
      parts.push(`  ${interview.teacherName} (${interview.conductedAt}, areas: ${interview.areasCovered.join(", ")}):`);
      for (const ex of interview.exchanges) {
        parts.push(`    Q: ${ex.questionText}`);
        if (ex.responseText) parts.push(`    A: ${ex.responseText}`);
      }
    }
  } else {
    parts.push("", "No recent interviews for this student.");
  }

  if (baseballCard) {
    parts.push(
      "",
      `Baseball card (last ${baseballCard.windowDays} days, ${baseballCard.noteCount} observations):`,
      baseballCard.summary,
    );
    if (baseballCard.coverageGaps?.length) {
      parts.push(`Coverage gaps: ${baseballCard.coverageGaps.join(", ")}`);
    }
  } else {
    parts.push("", "No baseball card available.");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Validate a single turn-by-turn LLM response (the format the system prompt
 * actually produces). Handles both first-turn (explorationAreas + question)
 * and subsequent-turn (thinking + question) shapes.
 */
export function parseTurnResponse(rawContent, areas) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${(rawContent || "").slice(0, 200)}`);
  }

  const warnings = [];

  if (!parsed.question || typeof parsed.question !== "object") {
    throw new Error('LLM response must contain a "question" object');
  }

  const q = parsed.question;
  if (q.area && !areas.includes(q.area)) {
    warnings.push(`Unknown area "${q.area}" (expected one of: ${areas.join(", ")})`);
  }
  if (q.type === "open" && Array.isArray(q.options)) {
    delete q.options;
  }

  // Validate exploration areas on first turn
  if (parsed.explorationAreas) {
    if (!Array.isArray(parsed.explorationAreas)) {
      warnings.push("explorationAreas should be an array");
    }
  }

  return {
    question: parsed.question,
    explorationAreas: parsed.explorationAreas || null,
    thinking: parsed.thinking || null,
    warnings,
  };
}

/**
 * Validate a batch question response (array of questions with coverage report).
 * Used for offline evaluation — not the live turn-by-turn flow.
 */
export function parseQuestionResponse(rawContent, areas) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${(rawContent || "").slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.questions)) {
    throw new Error('LLM response must contain a "questions" array');
  }

  const warnings = [];

  for (const q of parsed.questions) {
    if (q.area && !areas.includes(q.area)) {
      warnings.push(`Question ${q.id}: unknown area "${q.area}" (expected one of: ${areas.join(", ")})`);
    }
    // Strip spurious options from open-ended questions
    if (q.type === "open" && Array.isArray(q.options)) {
      delete q.options;
    }
  }

  return {
    questions: parsed.questions,
    coverageReport: parsed.coverageReport || null,
    warnings,
  };
}

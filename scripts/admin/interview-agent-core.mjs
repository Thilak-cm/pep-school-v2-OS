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

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

export function buildSystemPrompt(guidelines, soul, baseballCard, studentContext) {
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

YOUR BEHAVIOUR:
- On the FIRST turn, output TWO exploration areas for this interview session (a loose agenda — areas where you want to learn more, based on gaps in the soul or thin evidence). Then output your first question.
- On SUBSEQUENT turns, read the teacher's answer, then generate the next question. You may:
  - Follow up on the same topic if the answer was interesting or incomplete
  - Switch to your second exploration area
  - Go somewhere entirely new if the conversation reveals something unexpected
- You have FREE RANGE in question-asking. The only constraint: stay within this student's developmental context. Goal is to learn more about the student.
- Avoid re-asking areas already covered in recent interviews — check the interview history provided.
- Frame questions naturally — as a colleague asking a fellow teacher, not as an examiner
- Mix question types: some open-ended, some multiple-choice when developmental stages are useful
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
    "type": "open" or "mcq",
    "area": "Which developmental area this targets",
    "options": ["A", "B", "C", "D"]  // ONLY for mcq, OMIT for open
  }
}

Subsequent turns:
{
  "thinking": "Brief internal reasoning about what to ask next and why (1-2 sentences)",
  "question": {
    "text": "The next question",
    "type": "open" or "mcq",
    "area": "Which developmental area this targets",
    "options": ["A", "B", "C", "D"]  // ONLY for mcq, OMIT for open
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

export function parseQuestionResponse(rawContent, areas) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${rawContent.slice(0, 200)}`);
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

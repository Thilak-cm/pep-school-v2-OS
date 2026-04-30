/**
 * Pure prompt assembly helpers for interview question generation (PEP-172).
 *
 * No Firebase or Cloud Function imports — safe to use from CLI scripts,
 * Cloud Functions, and tests without triggering side effects.
 */

/**
 * Replace ${placeholder} tokens in the system prompt template with student data.
 * Uses function-form replacements to avoid $& / $' / $` interpretation.
 */
export function assembleSystemPrompt(template, { studentName, age, programId, soul, guidelines, baseballCard, openQuestions, priorInterviews }) {
  let prompt = template;

  // Simple token replacements — function form prevents $-pattern interpretation
  prompt = prompt.replace(/\$\{studentName\}/g, () => studentName || "Unknown");
  prompt = prompt.replace(/\$\{age\}/g, () => age || "age unavailable");
  prompt = prompt.replace(/\$\{programId\}/g, () => programId || "unknown");
  prompt = prompt.replace(/\$\{soul\}/g, () => soul || "No soul narrative available.");
  prompt = prompt.replace(/\$\{guidelines\}/g, () => guidelines || "No guidelines available.");

  // Baseball card — build formatted block or fallback
  const bcBlock = baseballCard
    ? `BASEBALL CARD (recent ${baseballCard.windowDays}-day summary, ${baseballCard.noteCount} observations):\n${baseballCard.summary}${baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${baseballCard.coverageGaps.join(", ")}` : ""}`
    : "No baseball card available.";
  prompt = prompt.replace(/\$\{baseballCard\}/g, () => bcBlock);

  // Open questions — build numbered list or empty
  const oqBlock = openQuestions?.length
    ? `OPEN QUESTIONS BANK (${openQuestions.length} pre-generated questions based on gaps in the soul narrative — use these as a starting point, adapt or rephrase as needed, and generate your own when the conversation goes somewhere new):\n${openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";
  prompt = prompt.replace(/\$\{openQuestions\}/g, () => oqBlock);

  // Prior interviews — append if available
  if (priorInterviews?.length) {
    const interviewBlock = `\nPRIOR INTERVIEW TRANSCRIPTS (${priorInterviews.length} completed sessions — avoid re-asking areas already covered):\n${JSON.stringify(priorInterviews, null, 2)}`;
    prompt += interviewBlock;
  }

  return prompt;
}

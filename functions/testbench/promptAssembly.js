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
export function assembleSystemPrompt(template, { studentName, age, programId, soul, guidelines, baseballCard, openQuestions, priorInterviews, sessionProgress }) {
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

  // Open questions — grouped by area (PEP-208)
  let oqBlock = "";
  if (openQuestions && typeof openQuestions === "object") {
    const areaKeys = Object.keys(openQuestions);
    const totalCount = areaKeys.reduce((sum, k) => sum + (openQuestions[k]?.length || 0), 0);
    if (areaKeys.length > 0 && totalCount > 0) {
      const sections = areaKeys.map((area) => {
        const questions = openQuestions[area] || [];
        return `### ${area}\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
      });
      oqBlock = `OPEN QUESTIONS BANK (${totalCount} questions across ${areaKeys.length} areas — use these as a starting point, adapt or rephrase as needed, and generate your own when the conversation goes somewhere new):\n${sections.join("\n\n")}`;
    }
  }
  prompt = prompt.replace(/\$\{openQuestions\}/g, () => oqBlock);

  // Session progress — placeholder replacement for templates that include it
  let spBlock = "";
  if (sessionProgress) {
    spBlock = `SESSION PROGRESS: This is question ${sessionProgress.questionCount} of the interview. ${sessionProgress.elapsedMinutes} minutes have elapsed. You should aim to wrap up around 7 questions or 10 minutes — find a natural stopping point when you feel the conversation has covered enough ground.`;
  }
  prompt = prompt.replace(/\$\{sessionProgress\}/g, () => spBlock);

  // Prior interviews — append if available
  if (priorInterviews?.length) {
    const interviewBlock = `\nPRIOR INTERVIEW TRANSCRIPTS (${priorInterviews.length} completed sessions — avoid re-asking areas already covered):\n${JSON.stringify(priorInterviews, null, 2)}`;
    prompt += interviewBlock;
  }

  // Session progress — always appended so it works even without ${sessionProgress} in template
  if (sessionProgress) {
    prompt += `\n\n${spBlock}`;
    prompt += `\n\nWhen you decide the interview has covered enough ground, instead of outputting a question, output:\n{"interviewComplete": true, "closingRemarks": "A brief, warm closing that summarises what you learned and thanks the teacher."}`;
  }

  return prompt;
}

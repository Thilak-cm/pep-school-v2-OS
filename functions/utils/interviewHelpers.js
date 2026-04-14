/**
 * Interview transcript helpers for profile generation.
 *
 * Formats interview transcripts into a shape optimised for the profile LLM's
 * context window: strips internal metadata, resolves MCQ option indices to
 * human-readable text, and normalises timestamps.
 */

/**
 * Normalise a value that may be a JS Date, Firestore Timestamp, or ISO string
 * into an ISO string (or null).
 */
function toISOString(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

/**
 * Format a single interview transcript for inclusion in the profile LLM prompt.
 *
 * Strips fields the LLM doesn't need (raw option arrays, timestamp per exchange,
 * selectedOption index) and resolves MCQ selections to readable text.
 *
 * @param {Object} interview - Raw interview doc from Firestore
 * @returns {Object} Prompt-ready interview object
 */
export function formatInterviewForPrompt(interview) {
  const exchanges = (interview.exchanges || []).map((ex) => {
    const base = {
      questionId: ex.questionId,
      questionText: ex.questionText,
      questionType: ex.questionType,
      dimension: ex.dimension,
    };

    if (ex.questionType === "mcq") {
      const hasAnswer = ex.selectedOption != null && Array.isArray(ex.options);
      base.selectedOptionText = hasAnswer
        ? ex.options[ex.selectedOption]
        : null;
    }

    if (ex.questionType === "open") {
      base.responseText = ex.responseText || null;
    }

    return base;
  });

  return {
    teacherName: interview.teacherName,
    conductedAt: toISOString(interview.conductedAt),
    status: interview.status,
    dimensionsCovered: interview.dimensionsCovered,
    exchanges,
  };
}

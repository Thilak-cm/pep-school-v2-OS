/**
 * PEP-222: Detect whether a student's soul/open_questions data is missing or empty.
 *
 * Used by InterviewWorkbench to proactively prompt soul generation
 * before the user tries to start an interview.
 */

/**
 * @param {object|null} studentContext - Context from InterviewQuestionConfig
 * @returns {boolean} true if soul or open_questions is missing/empty
 */
export function isMissingSoulData(studentContext) {
  if (!studentContext) return false; // not loaded yet, don't trigger dialog
  const soulMissing = !studentContext.soul;
  const oqMissing = !studentContext.openQuestions
    || Object.keys(studentContext.openQuestions).length === 0;
  return soulMissing || oqMissing;
}

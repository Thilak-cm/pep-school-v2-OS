/**
 * Pure helper functions for interview cold-start (PEP-208).
 *
 * No Firebase or side-effect imports — safe for testing and CLI usage.
 */

/**
 * Pick N random area keys from an areas object.
 * @param {{ [areaName: string]: string[] }} areas
 * @param {number} n - Number of areas to pick
 * @returns {string[]} Array of area key names
 */
export function pickRandomAreas(areas, n) {
  const keys = Object.keys(areas);
  if (keys.length === 0) {
    throw new Error("No areas available — open_questions doc has no areas");
  }
  if (n >= keys.length) return [...keys];

  // Fisher-Yates shuffle on a copy, then slice
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

/**
 * Pick a random question from the selected areas.
 * @param {{ [areaName: string]: string[] }} areas - Full areas object
 * @param {string[]} selectedAreaKeys - Area keys to pick from
 * @returns {{ question: string, area: string }}
 */
export function pickRandomQuestion(areas, selectedAreaKeys) {
  // Collect all questions with their area
  const pool = [];
  for (const key of selectedAreaKeys) {
    const questions = areas[key] || [];
    for (const q of questions) {
      pool.push({ question: q, area: key });
    }
  }
  if (pool.length === 0) {
    throw new Error("No questions available in selected areas");
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build a synthetic turn object that mimics LLM response shape.
 * This lets Q2's LLM call see Q1 as if the LLM generated it.
 *
 * @param {Object} params
 * @param {string} params.questionText
 * @param {string} params.questionArea
 * @param {Array<{area: string, rationale: string}>} params.explorationAreas
 * @returns {Object} Turn object matching the conversation turn shape
 */
export function buildSyntheticTurn({ questionText, questionArea, explorationAreas }) {
  const question = { text: questionText, area: questionArea, type: "open" };

  // Build rawContent as JSON matching the LLM response schema
  const rawContent = JSON.stringify({
    explorationAreas,
    question,
    thinking: null,
    interviewComplete: false,
  });

  return {
    type: "question",
    question,
    explorationAreas,
    thinking: null,
    rawContent,
    meta: { synthetic: true, tokens: 0, latencyMs: 0 },
  };
}

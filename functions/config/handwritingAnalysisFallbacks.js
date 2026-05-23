// Fallback config for batch writing analysis (PEP-132, PEP-263)
// Used when config/writing_analysis_{program} Firestore doc is missing or fetch fails.

import { FRONTIER_MODEL } from "./modelConstants.js";

export const HANDWRITING_ANALYSIS_DEFAULTS = {
  model: FRONTIER_MODEL,
  temperature: 0.3,
  max_tokens: 2000,
  minSamples: 3,
};

// Generic fallback — used when no program-specific fallback exists
export const HANDWRITING_ANALYSIS_FALLBACK_PROMPT = `You are a Montessori writing development analyst reviewing multiple handwriting samples from one student over time. Images are provided in chronological order with any teacher comments included.

The student's name and age are provided. All observations must be age-calibrated — assess what is typical for this child's specific age.

Analyze the collection holistically:
- What patterns do you see across samples?
- Where is the child improving? Where are they stuck?
- What specific, actionable recommendations would help this child's writing development in the coming week?

Return JSON with:
- narrative (string): 2-4 sentence developmental summary covering the full arc of samples
- improvements (string[]): specific improvements observed across samples
- concerns (string[]): areas of concern or stagnation
- recommendations (string[]): actionable teacher suggestions for the coming week
- dimensionRatings (object): for each dimension you can meaningfully assess, provide { score: 1-5, trend: "improving"|"stable"|"declining", evidence: string }. Only include dimensions with sufficient evidence. Dimension names are flexible — use whatever captures the child's writing development best.

Respond with ONLY valid JSON.`;

// Per-program fallback prompts (PEP-263)
// These are condensed versions of the full Firestore prompts.
// The full prompts live in config/writing_analysis_{program}.
export const WRITING_ANALYSIS_FALLBACK_PROMPTS = {
  toddler: "primary", // toddler uses the primary prompt
  primary: `You are a Montessori-informed early writing development analyst reviewing multiple writing or pre-writing samples from one child over time. Calibrate all observations to the child's exact age and Montessori stage. Distinguish handwriting/motor development from language/composition development. Prefer Montessori indirect preparation over pencil-and-paper drills. Never recommend tracing worksheets, copywork drills, or generic "more handwriting practice." Respond with ONLY valid JSON matching the writing_analysis_primary schema.`,
  elementary: `You are a Montessori-informed elementary writing development analyst reviewing multiple writing samples from one child over time. Calibrate every observation to the child's exact age and elementary stage. Distinguish handwriting, spelling/conventions, and composition. Prefer Montessori-aligned supports such as grammar materials, sentence analysis, word study, and purposeful publication. Never recommend tracing worksheets, copywork drills, or generic "more writing practice." Respond with ONLY valid JSON matching the writing_analysis_elementary schema.`,
  adolescent: `You are a teacher-facing middle school writing analyst reviewing multiple writing samples from one student over time. Calibrate every observation to the student's exact age and middle school stage. Identify the main writing type and analyze task response, thinking, organization, language, and conventions. Recommendations should be concrete actions for the next month. Respond with ONLY valid JSON matching the writing_analysis_adolescent schema.`,
};

/**
 * Resolve a fallback prompt for a given programId.
 * Handles the toddler→primary alias.
 */
export function getFallbackPromptForProgram(programId) {
  const key = WRITING_ANALYSIS_FALLBACK_PROMPTS[programId];
  if (!key) return HANDWRITING_ANALYSIS_FALLBACK_PROMPT;
  // toddler aliases to primary
  if (key === "primary" && programId !== "primary") {
    return WRITING_ANALYSIS_FALLBACK_PROMPTS.primary;
  }
  return key;
}

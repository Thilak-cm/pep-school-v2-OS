// Fallback config for batch handwriting analysis (PEP-132)
// Used when config/handwriting_analysis Firestore doc is missing or fetch fails.

import { FRONTIER_MODEL } from "./modelConstants.js";

export const HANDWRITING_ANALYSIS_DEFAULTS = {
  model: FRONTIER_MODEL,
  temperature: 0.3,
  max_tokens: 800,
  minSamples: 3,
};

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

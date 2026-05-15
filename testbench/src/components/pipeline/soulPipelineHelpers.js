/**
 * Pure helpers for SoulPromptPipeline (PEP-216).
 * Mirrors the block structure from functions/utils/soulHelpers.js
 * but for the client-side structural visualization.
 */

export const SOUL_BLOCKS = [
  // System prompt — decomposed into 3 blocks
  { number: "1", label: "Role Preamble", sublabel: "expert Montessori educator persona + task framing", section: "system", source: "config" },
  { number: "2", label: "Guidelines", sublabel: "injected via ${guidelinesContent} from config", section: "system", source: "config" },
  { number: "3", label: "Output Format & Instructions", sublabel: "heading structure, YAML suggestions, open questions format, continuity rules", section: "system", source: "config" },
  // User prompt — 4 blocks
  { number: "4", label: "Student Context", sublabel: "name, age, DOB, program", section: "user", source: "student" },
  { number: "5", label: "Observations", sublabel: "all observations within the configured time window", section: "user", source: "runtime" },
  { number: "6", label: "Interview Transcripts", sublabel: "high-signal evidence — treated with elevated weight", section: "user", source: "runtime" },
  { number: "7", label: "Previous Soul", sublabel: "prior narrative for continuity — omitted if first generation", section: "user", source: "runtime" },
];

/**
 * Extract the role preamble from the full assembled system prompt.
 * Everything before "## Your guidelines" is the preamble.
 * @param {string|null} systemPrompt - Full system prompt with guidelines injected
 * @returns {string|null}
 */
export function extractRolePreamble(systemPrompt) {
  if (!systemPrompt) return null;
  const idx = systemPrompt.indexOf("## Your guidelines");
  if (idx === -1) return systemPrompt; // No guidelines section found — return full prompt
  return systemPrompt.slice(0, idx).trim();
}

/**
 * Extract the output format instructions from the full assembled system prompt.
 * Everything after the guidelines content (starting from "## Output format") to the end.
 * @param {string|null} systemPrompt - Full system prompt with guidelines injected
 * @param {string|null} guidelinesContent - The guidelines markdown that was injected
 * @returns {string|null}
 */
export function extractOutputFormat(systemPrompt, guidelinesContent) {
  if (!systemPrompt) return null;
  const marker = "## Output format";
  const idx = systemPrompt.indexOf(marker);
  if (idx === -1) return null;
  return systemPrompt.slice(idx).trim();
}

/**
 * Build the content for the student context block.
 * @param {Object|null} student - { id, displayName }
 * @returns {string|null}
 */
export function buildStudentContextContent(student) {
  if (!student) return null;
  return JSON.stringify({ studentName: student.displayName, id: student.id }, null, 2);
}

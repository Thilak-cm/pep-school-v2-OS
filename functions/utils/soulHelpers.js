// Soul/guidelines generation helpers (PEP-149)
// Replaces profileConstants.js + profileHelpers.js

import { FRONTIER_MODEL } from "../config/modelConstants.js";

// Hard requirement: use latest frontier model for soul generation
// This is high-stakes data processing — not configurable downward
export const SOUL_MODEL = FRONTIER_MODEL;

export const SOUL_DEFAULTS = {
  model: SOUL_MODEL,
  temperature: 0,
  max_tokens: 12000,
};

export const VALID_PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

/**
 * Build the system prompt for soul generation.
 * The guidelines document is injected as a reference lens — the AI uses it
 * to know what developmental areas matter and what to look for.
 *
 * @param {string} guidelinesContent - Markdown guidelines document
 * @returns {string} System prompt
 */
export function buildSoulSystemPrompt(guidelinesContent) {
  return `You are an expert Montessori educator building a comprehensive developmental narrative ("soul") for a child. Your task is to synthesize all available observations and interview transcripts into a rich, nuanced markdown document that represents who this child is right now.

## Your guidelines

The following evaluation guide defines the developmental areas, skills, and observable benchmarks relevant to this child's program. Use it as a reference lens — scan it to know what to look for in the observations, but do not treat it as a rigid output template.

${guidelinesContent}

## Output format

Produce a markdown document with section headers (## headings) for each developmental area where you found meaningful evidence in the observations. Within each section, write narrative prose — not bullet points of benchmarks.

Structure guidelines:
- Use ## headings for major developmental areas (e.g., "## Social-Emotional Development", "## Mathematics")
- Write 2-5 sentences per section describing what you observe about this child
- Note specific examples from observations when they illuminate a pattern
- Include a "## Emergent Observations" section at the end for any signals that don't fit the guidelines categories — interests, behaviors, or patterns that are noteworthy but not captured by existing developmental areas
- If a guidelines area has no observations, omit the section entirely — do not write "no data available"

## Emergent observations and guidelines suggestions

After the Emergent Observations narrative, if you identified any recurring patterns or developmental areas that deserve their own place in this child's guidelines, append a fenced YAML block with structured suggestions. Each suggestion should propose a new skill area, name the discipline it belongs under (or propose a new one), and explain why it matters for this child.

Format:

\`\`\`yaml
guidelines_suggestions:
  - area: "Proposed Skill Area Name"
    discipline: "Existing or New Discipline Name"
    rationale: "Why this area matters for this child based on observed patterns"
\`\`\`

If there are no emergent patterns worth suggesting, omit the YAML block entirely. Only propose areas that show a clear, recurring signal across multiple observations — not one-off events.

## Continuity and stability

If a previous soul is provided, use it as a reference for continuity. A child's developmental narrative should not change dramatically week-to-week — significant drift from the previous version is a quality concern. Update sections where new evidence warrants it, preserve sections that remain accurate, and note meaningful changes or developments.

## Important

Output ONLY the markdown narrative (starting with the first ## heading), optionally followed by the YAML guidelines_suggestions block at the very end. No JSON wrapping, no other metadata, no preamble.`;
}

/**
 * Build the user prompt containing student context, observations, interviews,
 * and optionally the previous soul for continuity.
 *
 * @param {Object} studentContext - { studentName, age, dob, programId }
 * @param {Array} observations - Formatted observation objects
 * @param {Array} interviews - Formatted interview objects
 * @param {string|null} previousSoul - Previous soul content for continuity
 * @returns {string} User prompt
 */
export function buildSoulUserPrompt(studentContext, observations, interviews, previousSoul) {
  const parts = [
    "Generate a soul narrative for this student based on all available evidence.",
    "",
    `Student: ${JSON.stringify(studentContext)}`,
  ];

  if (observations.length > 0) {
    parts.push(
      "",
      `Observations (${observations.length} notes, JSON array):`,
      JSON.stringify(observations),
    );
  }

  if (interviews.length > 0) {
    parts.push(
      "",
      `Interview transcripts (${interviews.length} sessions, JSON array):`,
      "These are structured teacher interview responses — treat as high-signal evidence alongside observations.",
      JSON.stringify(interviews),
    );
  }

  if (previousSoul) {
    parts.push(
      "",
      "Previous soul (for continuity reference — update where evidence warrants, preserve what remains accurate):",
      previousSoul,
    );
  }

  return parts.join("\n");
}

/**
 * Validate and clean the LLM's soul response.
 * The response should be a non-empty markdown string.
 *
 * @param {string} rawContent - Raw LLM output
 * @returns {string} Cleaned content
 * @throws {Error} If content is empty
 */
export function parseSoulResponse(rawContent) {
  const content = (rawContent || "").trim();
  if (!content) {
    throw new Error("Soul generation returned empty content");
  }
  return content;
}

/**
 * Extract guidelines suggestions from the YAML block at the end of a soul response.
 * Returns an array of suggestion objects, or empty array if no block found.
 *
 * @param {string} soulContent - Full soul content (narrative + optional YAML block)
 * @returns {Array<{area: string, discipline: string, rationale: string}>}
 */
export function extractGuidelinesSuggestions(soulContent) {
  const yamlMatch = soulContent.match(/```yaml\s*\n(guidelines_suggestions:[\s\S]*?)```/);
  if (!yamlMatch) return [];

  const yamlBlock = yamlMatch[1];
  // Simple YAML parser for our specific format — no dependency needed
  const suggestions = [];
  let current = null;

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- area:")) {
      if (current) suggestions.push(current);
      current = { area: extractYamlValue(trimmed, "area"), discipline: "", rationale: "" };
    } else if (trimmed.startsWith("discipline:") && current) {
      current.discipline = extractYamlValue(trimmed, "discipline");
    } else if (trimmed.startsWith("rationale:") && current) {
      current.rationale = extractYamlValue(trimmed, "rationale");
    }
  }
  if (current) suggestions.push(current);

  const valid = suggestions.filter((s) => s.area);
  for (const s of valid) {
    if (!s.discipline || !s.rationale) {
      console.warn(`[soul] Guidelines suggestion for "${s.area}" has empty ${!s.discipline ? "discipline" : "rationale"} — LLM may have used an unexpected YAML format`);
    }
  }
  return valid;
}

function extractYamlValue(line, key) {
  const after = line.slice(line.indexOf(key + ":") + key.length + 1).trim();
  // Strip surrounding quotes
  if ((after.startsWith("\"") && after.endsWith("\"")) || (after.startsWith("'") && after.endsWith("'"))) {
    return after.slice(1, -1);
  }
  return after;
}

/**
 * Strip the YAML guidelines_suggestions block from soul content,
 * returning just the narrative markdown.
 *
 * @param {string} soulContent - Full soul content with optional YAML block
 * @returns {string} Narrative content without YAML block
 */
export function stripGuidelinesSuggestions(soulContent) {
  return soulContent.replace(/\n*```yaml\s*\nguidelines_suggestions:[\s\S]*?```\s*$/, "").trim();
}

/**
 * Build the Firestore document shape for a soul doc.
 *
 * @param {Object} params
 * @param {string} params.content - Markdown soul narrative
 * @param {string} params.programId
 * @param {number} params.observationCount
 * @param {number} params.interviewCount
 * @param {Date|null} params.lastObservationAt
 * @param {Date|null} params.lastInterviewAt
 * @returns {Object} Soul document fields
 */
export function buildSoulDoc({ content, programId, observationCount, interviewCount, lastObservationAt, lastInterviewAt }) {
  return {
    content,
    programId,
    updatedBy: "cloud-function:soul-generate",
    sourceStats: {
      observationCount,
      interviewCount,
      lastGeneratedAt: new Date(),
      lastObservationAt: lastObservationAt || null,
      lastInterviewAt: lastInterviewAt || null,
    },
  };
}

/**
 * Build the Firestore document shape for a guidelines doc.
 *
 * @param {Object} params
 * @param {string} params.content - Markdown guidelines content
 * @param {string} params.programId
 * @param {string} params.templateDocId - e.g., "config/soul_template_adolescent"
 * @returns {Object} Guidelines document fields
 */
export function buildGuidelinesDoc({ content, programId, templateDocId }) {
  return {
    content,
    programId,
    seededFrom: templateDocId,
    updatedBy: "cloud-function:soul-generate",
  };
}

/**
 * Build a history snapshot from a previous document state.
 *
 * @param {Object} prevDoc - Previous document data (content, updatedAt, updatedBy)
 * @param {string} reason - Why this snapshot was created
 * @returns {Object} History document fields
 */
export function buildHistorySnapshot(prevDoc, reason) {
  return {
    content: prevDoc.content,
    updatedAt: prevDoc.updatedAt || new Date(),
    updatedBy: prevDoc.updatedBy || "unknown",
    reason,
  };
}

/**
 * Check if a soul narrative contains non-empty emergent observations.
 * Used to flag students whose soul has content the guidelines don't cover.
 *
 * @param {string} soulContent - Markdown soul content
 * @returns {boolean} True if emergent observations section has content
 */
export function hasEmergentObservations(soulContent) {
  const match = soulContent.match(/##\s*Emergent Observations\s*\n([\s\S]*?)(?=\n##\s|\s*$)/i);
  if (!match) return false;
  return match[1].trim().length > 0;
}

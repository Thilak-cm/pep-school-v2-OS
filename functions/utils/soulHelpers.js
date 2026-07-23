// Soul/guidelines generation helpers (PEP-149)
// Replaces profileConstants.js + profileHelpers.js

import { FRONTIER_MODEL } from "../config/modelConstants.js";

// Fallback defaults — used when config/soul_generation doc is missing
export const SOUL_DEFAULTS = {
  model: FRONTIER_MODEL,
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
- Include a "## Emergent Observations" section for any signals that don't fit the guidelines categories — interests, behaviors, or patterns that are noteworthy but not captured by existing developmental areas
- If a guidelines area has no observations, omit the section entirely — do not write "no data available"

## Emergent observations and guidelines suggestions

At the very end of the document (after all narrative sections including Emergent Observations), if you identified any recurring patterns or developmental areas that deserve their own place in this child's guidelines, append a fenced YAML block with structured suggestions. Each suggestion should propose a new skill area, name the discipline it belongs under (or propose a new one), and explain why it matters for this child.

Format:

\`\`\`yaml
guidelines_suggestions:
  - area: "Proposed Skill Area Name"
    discipline: "Existing or New Discipline Name"
    rationale: "Why this area matters for this child based on observed patterns"
\`\`\`

If there are no emergent patterns worth suggesting, omit the YAML block entirely. Only propose areas that show a clear, recurring signal across multiple observations — not one-off events.

## Open questions for interviews

After the guidelines_suggestions block (or after Emergent Observations if no suggestions), append a fenced block of open questions that teachers could be asked about this child during interviews, organized by exploration area. Each area groups questions about a developmental theme where evidence is thin, contradictory, single-sourced, or stale. You have free range to identify areas — do not limit yourself to guidelines categories. Focus on what would be most valuable to explore next.

Questions should:
- Range from specific ("Does Aria choose the bead chain independently or only when directed?") to broad ("How does this child navigate conflict with peers?")
- Be phrased as questions a knowledgeable interviewer would ask a teacher
- Be fully self-contained — a teacher reading a single question with NO other context must understand exactly what is being asked. Never use vague references like "at this point", "the current situation", or "as mentioned". Instead, name the specific skill, behavior, or observation the question is about (e.g., instead of "Would a more systematic reading intervention be appropriate at this point?" write "Aria has been reading at a pre-primer level for 3 months — has the team considered a structured phonics intervention like Orton-Gillingham?")
- Avoid yes/no phrasing — use open-ended "how", "what", "describe" stems that invite the teacher to share detail

Format — a JSON object with area names as keys and arrays of question strings as values:

\`\`\`open_questions
{
  "areas": {
    "Self-Regulation & Emotional Awareness": [
      "When the child argues with a teacher, what seems to trigger it?",
      "How does the child respond after a conflict once cooled down?"
    ],
    "Reading Profile & Language Load": [
      "What is the current reading level in English in practical terms?",
      "Is the main reading difficulty decoding, fluency, vocabulary, or comprehension?"
    ]
  }
}
\`\`\`

Generate as many areas and questions as the evidence warrants (aim for ~50 questions across 5-10 areas). If the child has very limited data, generate fewer but still aim for at least 10-15 questions covering the gaps. Always include this block — even with limited data there are always questions worth asking.

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
 * Extract guidelines suggestions from the YAML block at the end of a soul response,
 * and return the content with the YAML block removed.
 *
 * @param {string} soulContent - Full soul content (narrative + optional YAML block)
 * @returns {{suggestions: Array<{area: string, discipline: string, rationale: string}>, content: string}}
 */
export function extractGuidelinesSuggestions(soulContent) {
  const yamlMatch = soulContent.match(/```yaml\s*\n(guidelines_suggestions:[\s\S]*?)```/);
  if (!yamlMatch) return { suggestions: [], content: soulContent };

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

  // Strip the YAML block from content
  const content = soulContent.replace(/\n*```yaml\s*\nguidelines_suggestions:[\s\S]*?```/, "").trim();

  return { suggestions: valid, content };
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
 * Extract open questions from the fenced block at the end of a soul response,
 * and return the content with the block removed.
 * PEP-207: Now expects area-keyed JSON format instead of flat numbered list.
 *
 * @param {string} soulContent - Full soul content (narrative + optional open_questions block)
 * @returns {{areas: Object<string, string[]>, content: string}}
 */
export function extractOpenQuestions(soulContent) {
  const match = soulContent.match(/\n*```open_questions\s*\n([\s\S]*?)```/);
  if (!match) return { areas: {}, content: soulContent };

  const block = match[1].trim();
  let areas = {};
  if (block) {
    try {
      const parsed = JSON.parse(block);
      const raw = (parsed && typeof parsed.areas === "object" && parsed.areas !== null) ? parsed.areas : {};
      areas = Object.fromEntries(Object.entries(raw).filter(([, v]) => Array.isArray(v)));
    } catch {
      console.warn("[soul] Failed to parse open_questions JSON block — returning empty areas");
    }
  }

  const content = soulContent.replace(/\n*```open_questions\s*\n[\s\S]*?```\s*/, "").trim();

  return { areas, content };
}

/**
 * Build the Firestore document shape for an open_questions doc.
 * PEP-207: Area-keyed shape. #144: Enriched with status tracking.
 *
 * Transforms raw LLM-extracted string arrays into enriched question objects
 * with status tracking fields for the Question Deck UI.
 *
 * @param {Object} params
 * @param {Object<string, string[]>} params.areas - Area name → question strings (from LLM)
 * @param {string} params.programId
 * @returns {Object} Open questions document fields with enriched question objects
 */
export function buildOpenQuestionsDoc({ areas, programId }) {
  const enriched = {};
  for (const [area, questions] of Object.entries(areas)) {
    enriched[area] = questions.map((q) => ({ question: q, answers: [] }));
  }
  return {
    areas: enriched,
    programId,
    updatedBy: "cloud-function:soul-generate",
  };
}

/**
 * Build a history snapshot from a previous open_questions document.
 * Unlike buildHistorySnapshot (soul-specific), this preserves all fields
 * from the raw doc and adds archival metadata.
 *
 * @param {Object} prevDoc - Previous open_questions document data
 * @param {import("firebase-admin/firestore").Timestamp} archivedAt - Timestamp of archival
 * @returns {Object} History document fields
 */
export function buildOpenQuestionsHistorySnapshot(prevDoc, archivedAt) {
  return {
    ...prevDoc,
    archivedAt,
    archivedBy: "cloud-function:soul-generate",
  };
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
 * @param {string} params.templateDocId - e.g., "config/soul_guidelines_adolescent"
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


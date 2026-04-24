/**
 * Pure helper functions for batch handwriting analysis (PEP-132).
 * Extracted for testability — no Firebase or network dependencies.
 */

/**
 * Calculate age from dateOfBirth relative to a reference date.
 * @param {Date|null} dob
 * @param {Date} now
 * @returns {{ years: number, months: number } | null}
 */
export function calculateAge(dob, now) {
  if (!dob) return null;
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  // If we haven't reached the day yet this month, subtract a month
  if (now.getDate() < dob.getDate()) {
    months--;
    if (months < 0) {
      years--;
      months += 12;
    }
  }
  return { years, months };
}

/**
 * Format a Date as a human-readable string (e.g., "April 1, 2026").
 */
function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build the user-content portion of the batch writing VLM prompt.
 * Images are represented as placeholders — the caller inserts actual base64 content parts.
 *
 * @param {Array<Object>} mediaDocs - Ordered by observedAt asc. Each: { id, observedAt, teacherComment, copied, curriculumArea, createdByName }
 * @param {Object} student - { displayName, dateOfBirth }
 * @param {Object|null} previousAnalysis - Previous ai_summaries/writing_analysis doc, if exists
 * @param {Date} now - Current date for age calculation
 * @returns {string} The text portion of the prompt (image content parts added separately)
 */
export function buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, now) {
  const age = calculateAge(student.dateOfBirth, now);
  const ageStr = age ? `${age.years} years, ${age.months} months` : "unknown";

  const lines = [];
  lines.push(`Student: ${student.displayName}`);
  lines.push(`Age: ${ageStr}`);
  lines.push(`Total samples: ${mediaDocs.length}`);
  lines.push("");

  // Include previous analysis for longitudinal context
  if (previousAnalysis) {
    lines.push("--- Previous writing analysis ---");
    if (previousAnalysis.narrative) {
      lines.push(`Summary: ${previousAnalysis.narrative}`);
    }
    if (previousAnalysis.dimensionRatings && Object.keys(previousAnalysis.dimensionRatings).length > 0) {
      lines.push("Previous dimension ratings:");
      for (const [dim, rating] of Object.entries(previousAnalysis.dimensionRatings)) {
        const parts = [`${dim}: ${rating.score}/5`];
        if (rating.trend) parts.push(`trend: ${rating.trend}`);
        if (rating.evidence) parts.push(`evidence: ${rating.evidence}`);
        lines.push(`  - ${parts.join(", ")}`);
      }
    }
    lines.push("--- End previous analysis ---");
    lines.push("");
    lines.push("Now analyze the NEW samples below in the context of the previous analysis. Note any changes in trajectory.");
    lines.push("");
  }

  // Per-image annotations
  for (let i = 0; i < mediaDocs.length; i++) {
    const doc = mediaDocs[i];
    lines.push(`[Image ${i + 1} of ${mediaDocs.length} — ${formatDate(doc.observedAt)}]`);
    lines.push(`Uploaded by: ${doc.createdByName || "Unknown"}`);
    lines.push(`Curriculum area: ${doc.curriculumArea || "Not classified"}`);
    lines.push(`Copied: ${doc.copied ? "Yes" : "No"}`);
    if (doc.teacherComment) {
      lines.push(`Teacher comment: "${doc.teacherComment}"`);
    }
    lines.push(""); // blank line before next image placeholder
  }

  return lines.join("\n");
}

/**
 * Parse and validate the VLM response for batch writing analysis.
 * Returns normalized object or null if unparseable.
 *
 * @param {Object|string|null} response - Parsed JSON from VLM
 * @returns {Object|null}
 */
export function parseWritingAnalysisResponse(response) {
  if (!response || typeof response !== "object") return null;

  return {
    narrative: typeof response.narrative === "string" ? response.narrative : "",
    improvements: Array.isArray(response.improvements) ? response.improvements : [],
    concerns: Array.isArray(response.concerns) ? response.concerns : [],
    recommendations: Array.isArray(response.recommendations) ? response.recommendations : [],
    dimensionRatings: response.dimensionRatings && typeof response.dimensionRatings === "object"
      ? response.dimensionRatings
      : {},
  };
}

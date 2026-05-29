/**
 * PEP-260: Monthly plan production helpers.
 *
 * Pure functions for serializing student data into LLM prompt text.
 * Copied from testbench/monthlyPlan.js (Option B — independent copies).
 */

/**
 * Serialize a single observation into a text line for the prompt.
 */
export function serializeObservation(obs) {
  const date = obs.observedAt?.toDate?.()
    ?? (obs.observedAt ? new Date(obs.observedAt) : null);
  const dateStr = date ? date.toISOString().slice(0, 10) : "unknown date";
  const type = obs.type || "text";

  const parts = [`[${dateStr}] (${type})`];

  if (type === "lesson") {
    if (obs.lessonTitle) parts.push(obs.lessonTitle);
    if (obs.lessonDescription) parts.push(`— ${obs.lessonDescription}`);
    if (obs.ratings) {
      const ratingStr = Object.entries(obs.ratings)
        .map(([dim, val]) => `${dim}: ${val}`)
        .join(", ");
      if (ratingStr) parts.push(`[Ratings: ${ratingStr}]`);
    }
    if (obs.studentComment) parts.push(`Teacher comment: ${obs.studentComment}`);
    if (obs.groupComment) parts.push(`Group comment: ${obs.groupComment}`);
  } else {
    if (obs.text) parts.push(obs.text);
  }

  if (obs.createdByName) parts.push(`(by ${obs.createdByName})`);

  return parts.join(" ");
}

/**
 * Serialize a media doc into a text line for the prompt.
 */
export function serializeMedia(media) {
  const date = media.observedAt?.toDate?.()
    ?? (media.observedAt ? new Date(media.observedAt) : null);
  const dateStr = date ? date.toISOString().slice(0, 10) : "unknown date";
  const kind = media.mediaKind || "photo";

  const parts = [`[${dateStr}] (media/${kind})`];
  if (media.curriculumArea) parts.push(`[${media.curriculumArea}]`);
  if (media.teacherComment) parts.push(media.teacherComment);
  if (media.createdByName) parts.push(`(by ${media.createdByName})`);

  return parts.join(" ");
}

/**
 * Format writing analysis document into prompt text.
 */
export function formatWritingAnalysis(analysis) {
  if (!analysis) return "No writing analysis available for this student.";

  const parts = [];
  if (analysis.narrative) parts.push(analysis.narrative);

  if (analysis.dimensionRatings) {
    parts.push("\nDimension Ratings:");
    for (const [dim, info] of Object.entries(analysis.dimensionRatings)) {
      const score = info.score != null ? `${info.score}/5` : "n/a";
      const trend = info.trend || "unknown";
      parts.push(`  ${dim}: ${score} (${trend})${info.evidence ? ` — ${info.evidence}` : ""}`);
    }
  }

  if (analysis.improvements?.length) {
    parts.push(`\nImprovements: ${analysis.improvements.join("; ")}`);
  }
  if (analysis.concerns?.length) {
    parts.push(`Concerns: ${analysis.concerns.join("; ")}`);
  }
  if (analysis.recommendations?.length) {
    parts.push(`Recommendations: ${analysis.recommendations.join("; ")}`);
  }

  return parts.join("\n");
}

/**
 * Build the user prompt from all gathered context.
 *
 * @param {object} opts
 * @param {object} opts.profile       — { displayName, studentId, ageStr, programId, targetMonth, joiningDate? (relative, e.g. "joined 3 weeks ago") }
 * @param {object[]} opts.observations — observation docs (already sorted desc)
 * @param {object[]} opts.mediaDocs    — media docs (already sorted desc)
 * @param {object|null} opts.writingAnalysis — writing_analysis doc data or null
 * @param {object|null} opts.precedingPlan   — previous month's plan doc data or null
 * @param {object|null} opts.lessonHistory   — future placeholder, currently null
 * @param {object|null} opts.curriculumSequence — future placeholder, currently null
 * @returns {string}
 */
export function buildUserPrompt({
  profile,
  observations,
  mediaDocs,
  writingAnalysis,
  precedingPlan,
  lessonHistory = null,
  curriculumSequence = null,
}) {
  const parts = [
    `Student: ${profile.displayName || profile.studentId}`,
    `Student ID: ${profile.studentId}`,
    `Age: ${profile.ageStr}`,
    `Program: ${profile.programId}`,
    `Target Month: ${profile.targetMonth}`,
    ...(profile.joiningDate ? [`Joined: ${profile.joiningDate}`] : []),
    "",
    "=== Writing Analysis ===",
    formatWritingAnalysis(writingAnalysis),
    "",
    `=== Observations (${observations.length} notes, most recent first) ===`,
  ];

  for (const obs of observations) {
    parts.push(serializeObservation(obs));
  }
  if (observations.length === 0) {
    parts.push("(No observations found in the last 4 months)");
  }

  parts.push("");
  parts.push(`=== Media Notes (${mediaDocs.length} items, most recent first) ===`);
  for (const media of mediaDocs) {
    parts.push(serializeMedia(media));
  }
  if (mediaDocs.length === 0) {
    parts.push("(No media notes found in the last 4 months)");
  }

  // Optional: preceding month's plan for continuity
  if (precedingPlan) {
    parts.push("");
    parts.push("=== Preceding Month Plan ===");
    parts.push(`Month: ${precedingPlan.month || "unknown"}`);
    if (precedingPlan.sections) {
      for (const section of precedingPlan.sections) {
        parts.push(`\n${section.name}:`);
        if (section.position) parts.push(`  Position: ${section.position}`);
        if (section.monthlyAim) parts.push(`  Aim: ${section.monthlyAim}`);
        if (section.items?.length) {
          for (const item of section.items) {
            const workText = typeof item === "string" ? item : item.work || JSON.stringify(item);
            parts.push(`  - ${workText}`);
          }
        }
      }
    }
  }

  // Future: lessonHistory and curriculumSequence
  if (lessonHistory) {
    parts.push("");
    parts.push("=== Lesson History ===");
    parts.push(typeof lessonHistory === "string" ? lessonHistory : JSON.stringify(lessonHistory, null, 2));
  }

  if (curriculumSequence) {
    parts.push("");
    parts.push("=== Curriculum Sequence ===");
    parts.push(typeof curriculumSequence === "string" ? curriculumSequence : JSON.stringify(curriculumSequence, null, 2));
  }

  return parts.join("\n");
}

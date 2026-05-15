/**
 * Pure helpers for HandwritingPromptPipeline (PEP-216).
 * Mirrors the block structure from functions/utils/handwritingAnalysisHelpers.js
 * but for the client-side structural visualization.
 */

export const HANDWRITING_BLOCKS = [
  { number: "1", label: "System Prompt", sublabel: "from Firestore config — handwriting analysis instructions", section: "system", source: "config" },
  { number: "2", label: "Student Header", sublabel: "name, age (from DOB), total writing samples", section: "user", source: "student" },
  { number: "3", label: "Previous Analysis", sublabel: "longitudinal context — prior narrative + dimension ratings", section: "user", source: "runtime" },
  { number: "4", label: "Per-Image Annotations", sublabel: "date, uploader, curriculum area, copied flag, teacher comment per sample", section: "user", source: "runtime" },
  { number: "5", label: "Writing Sample Images", sublabel: "base64-encoded images interleaved after each annotation", section: "user", source: "runtime" },
];

/**
 * Build the content for the student header block.
 * @param {Object|null} student - { displayName, classroomName, classroomId, handwrittenCount }
 * @returns {string|null}
 */
export function buildStudentHeaderContent(student) {
  if (!student) return null;
  const parts = [`Student: ${student.displayName}`];
  // Age is calculated server-side from student DOB — show placeholder
  parts.push("Age: (resolved server-side from DOB)");
  if (student.handwrittenCount != null) {
    parts.push(`Total writing samples: ${student.handwrittenCount}`);
  }
  return parts.join("\n");
}

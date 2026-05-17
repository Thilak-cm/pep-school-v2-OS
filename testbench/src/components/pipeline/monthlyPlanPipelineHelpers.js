/**
 * Pure helpers for MonthlyPlanPromptPipeline (PEP-235).
 * Describes the block structure of the monthly plan prompt
 * for client-side structural visualization.
 */

export const MONTHLY_PLAN_BLOCKS = [
  { number: "1", label: "System Prompt", sublabel: "from Firestore config — plan generation instructions", section: "system", source: "config" },
  { number: "2", label: "Student Header", sublabel: "name, age, program", section: "user", source: "student" },
  { number: "3", label: "Writing Analysis", sublabel: "narrative, dimension ratings, improvements, concerns", section: "user", source: "runtime" },
  { number: "4", label: "Observations (4 months)", sublabel: "all text, voice, lesson, media observations — most recent first", section: "user", source: "runtime" },
];

/**
 * Build the content for the student header block.
 * @param {Object|null} student - { id, displayName, classroomName }
 * @returns {string|null}
 */
export function buildStudentHeaderContent(student) {
  if (!student) return null;
  const parts = [`Student: ${student.displayName}`];
  parts.push("Age: (resolved server-side from DOB)");
  parts.push("Program: (resolved server-side from student doc)");
  if (student.classroomName) {
    parts.push(`Classroom: ${student.classroomName}`);
  }
  return parts.join("\n");
}

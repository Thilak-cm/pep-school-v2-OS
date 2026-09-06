/**
 * #167: Dispatch-time filtering for monthly plan batch.
 *
 * buildDispatchList: determines which students need plan generation and
 * which already have the target month's plan. This is a monthlyPlan-only
 * concern (other jobs dispatch all active students and skip worker-side).
 *
 * Message parsing moved to shared fanout helper (#279).
 */

const ELIGIBLE_PROGRAMS = ["toddler", "primary"];

/**
 * Build the list of student IDs to publish to the worker topic.
 *
 * @param {Array} studentSnaps - Firestore document snapshots for all active students
 * @param {Object} classroomProgramMap - { classroomId: programId } for fallback lookup
 * @param {Object} existingPlanMonths - { studentId: month } from current monthly_plan docs
 * @param {string} targetMonth - YYYY-MM format
 * @returns {{ toPublish: string[], skipped: number }}
 */
export function buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, targetMonth) {
  const toPublish = [];
  let skipped = 0;

  for (const snap of studentSnaps) {
    if (!snap.exists) continue;
    const data = snap.data();

    // Resolve program: student doc first, then classroom fallback
    const programId = data.programId || classroomProgramMap[data.classroomId] || null;
    if (!ELIGIBLE_PROGRAMS.includes(programId)) continue;

    // Skip if already generated for target month
    if (existingPlanMonths[snap.id] === targetMonth) {
      skipped++;
      continue;
    }

    toPublish.push(snap.id);
  }

  return { toPublish, skipped };
}

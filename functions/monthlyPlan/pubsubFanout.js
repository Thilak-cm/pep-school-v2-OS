/**
 * #167: Pub/Sub fan-out helpers for monthly plan batch.
 *
 * Pure functions extracted for testability:
 * - buildDispatchList: filters eligible students and skips already-done
 * - parseWorkerMessage: validates and extracts Pub/Sub message payload
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

/**
 * Parse and validate a Pub/Sub message for the monthly plan worker.
 *
 * @param {Object} message - Pub/Sub message object with .json property
 * @returns {{ studentId: string, targetMonth: string }}
 * @throws {Error} if message is invalid or missing required fields
 */
export function parseWorkerMessage(message) {
  const payload = message?.json;
  if (!payload) {
    throw new Error("Invalid Pub/Sub message: missing or null JSON payload");
  }
  if (!payload.studentId) {
    throw new Error("Invalid Pub/Sub message: studentId is required");
  }
  if (!payload.targetMonth) {
    throw new Error("Invalid Pub/Sub message: targetMonth is required");
  }
  return { studentId: payload.studentId, targetMonth: payload.targetMonth };
}

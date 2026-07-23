/**
 * #203: Pub/Sub fan-out helpers for soul generation batch.
 *
 * Pure functions extracted for testability:
 * - chunkStudentIds: splits student ID array into batches
 * - parseSoulWorkerMessage: validates and extracts Pub/Sub message payload
 */

/**
 * Split an array of student IDs into batches of `batchSize`.
 *
 * @param {string[]} ids - student IDs to chunk
 * @param {number} [batchSize=10] - max students per chunk
 * @returns {string[][]} array of batches
 */
export function chunkStudentIds(ids, batchSize = 10) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    chunks.push(ids.slice(i, i + batchSize));
  }
  return chunks;
}

/**
 * Parse and validate a Pub/Sub message for the soul worker.
 *
 * @param {Object} message - Pub/Sub message object with .json property
 * @returns {{ studentIds: string[] }}
 * @throws {Error} if message is invalid or missing required fields
 */
export function parseSoulWorkerMessage(message) {
  const payload = message?.json;
  if (!payload) {
    throw new Error("Invalid Pub/Sub message: missing or null JSON payload");
  }
  if (!payload.studentIds || !payload.studentIds.length) {
    throw new Error("Invalid Pub/Sub message: studentIds is required");
  }
  return { studentIds: payload.studentIds };
}

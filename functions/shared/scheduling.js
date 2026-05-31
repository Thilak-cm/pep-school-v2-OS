import { db } from "./firebase.js";

/**
 * Fetch all active student IDs from Firestore.
 * Shared by scheduled CFs (baseball cards, writing analysis, etc.).
 */
export async function fetchActiveStudentIds() {
  const studentsSnap = await db.collection("students").where("status", "==", "active").get();
  return studentsSnap.docs.map((doc) => doc.id);
}

/**
 * Run an async worker function over a list of items with bounded concurrency.
 * Per-item errors are logged and swallowed so one failure doesn't abort the batch.
 *
 * @param {Array} items - Items to process
 * @param {Function} worker - Async function called with each item
 * @param {number} limit - Max concurrent workers (default 10)
 */
export async function runWithConcurrency(items, worker, limit = 10) {
  const queue = [...items];
  const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      try {
        await worker(next);
      } catch (err) {
        console.error("[runWithConcurrency] worker error", err);
      }
    }
  });
  await Promise.all(workers);
}

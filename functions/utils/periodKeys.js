/**
 * Period-key computation for execution ledger and job idempotency.
 *
 * Each scheduled job uses a deterministic period key as its executionId.
 * These functions are the single source of truth - both the jobs and the
 * verifiers call the same function to compute the expected period key.
 *
 * All functions accept an optional `now` parameter for testability.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Return the current month in IST as "YYYY-MM".
 * Used by: soul dispatcher (executionId = current month being generated for).
 */
export function getCurrentMonthIST(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Return the next month from current IST date as "YYYY-MM".
 * Used by: monthly-plan dispatcher (generates next month's plan at end of current month).
 * Date.UTC handles month overflow: month 12 rolls to Jan of next year.
 */
export function getNextMonthIST(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const next = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Return a run-month key in IST as "YYYY-MM".
 * Used by: cleanupDeletedChats (executionId = the month the cleanup runs in).
 * Identical to getCurrentMonthIST but named distinctly for semantic clarity.
 */
export function getRunMonthIST(now = new Date()) {
  return getCurrentMonthIST(now);
}

/**
 * Check whether the current IST date is the last day of the month.
 * Used by: monthly-plan verifier (mirrors the dispatcher's last-day guard).
 */
export function isLastDayOfMonthIST(now = new Date()) {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return istNow.getUTCDate() === lastDay;
}

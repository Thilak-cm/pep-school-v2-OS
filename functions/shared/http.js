/**
 * Outbound-call timeout helpers (#288).
 *
 * Why these exist: Node's fetch() has no default timeout, so a stalled
 * provider connection hangs until the Cloud Function's own timeout kills
 * the invocation from outside - zero logs, no error path, no workItem
 * (the W37 writingAnalysis silent drop). These helpers convert hangs into
 * ordinary classified errors that fire INSIDE the CF budget.
 *
 * Design (#288 decisions):
 * - No default timeout here or in shared callers (runLLM/runAgentLoop).
 *   The entry point owns its CF budget and passes timeoutMs down - shared
 *   helpers serve entry points with different budgets (regenerateSoul 120s
 *   vs soulWorker 300s), so any flat default is wrong for someone.
 * - Timeout values are ~2x the max observed successful latency per
 *   background path (evidence table in #288). Interactive onCall paths
 *   pass nothing: their failures are already user-visible.
 */

/**
 * fetch() with an AbortController deadline.
 *
 * @param {string} url
 * @param {object} [options] fetch options (signal is overwritten when timeoutMs is set)
 * @param {number} [timeoutMs] Absent/falsy = plain fetch, no abort timer.
 * @return {Promise<Response>} Rejects with AbortError at the deadline.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs) {
  if (!timeoutMs) return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Promise.race deadline wrapper for SDKs without AbortController support
 * (e.g. @google-cloud/storage downloads). Trade-off: the underlying
 * operation keeps running after rejection - the invocation just stops
 * waiting and fails fast instead of dying silently at the CF timeout.
 *
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} [label] Included in the TimeoutError message.
 * @return {Promise<*>} Rejects with TimeoutError after ms.
 */
export function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

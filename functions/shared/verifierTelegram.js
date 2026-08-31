/**
 * Verifier Telegram signal formatter (#229).
 *
 * Formats green (success) and red (failure) messages for the execution
 * ledger verifier results. PII-free: only jobKey, executionId, counts,
 * duration, and failure categories appear in messages.
 */

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format a human-readable duration from milliseconds.
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return "unknown";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Build a green (success) Telegram message.
 * @param {object} summary
 * @param {string} summary.jobKey
 * @param {string} summary.executionId
 * @param {number} summary.completedCount
 * @param {number} summary.skippedCount
 * @param {number} summary.expectedCount
 * @param {number} [summary.durationMs]
 * @returns {string} HTML-formatted message
 */
export function formatGreenSignal(summary) {
  const duration = formatDuration(summary.durationMs);
  const parts = [
    `<b>Job Verified</b>`,
    `${escapeHtml(summary.jobKey)} - ${escapeHtml(summary.executionId)}`,
    `${summary.completedCount} completed, ${summary.skippedCount} skipped / ${summary.expectedCount} expected`,
    `Duration: ${duration}`,
  ];
  return parts.join("\n");
}

/**
 * Build a red (failure) Telegram message.
 * @param {object} summary
 * @param {string} summary.jobKey
 * @param {string} summary.executionId
 * @param {number} summary.completedCount
 * @param {number} summary.skippedCount
 * @param {number} summary.failedCount
 * @param {number} summary.missingCount
 * @param {number} summary.unverifiedCount
 * @param {number} summary.expectedCount
 * @param {string} [summary.dominantFailureCategory]
 * @param {number} [summary.durationMs]
 * @returns {string} HTML-formatted message
 */
export function formatRedSignal(summary) {
  const duration = formatDuration(summary.durationMs);
  const problemCount = summary.failedCount + summary.missingCount + (summary.unverifiedCount || 0);
  const parts = [
    `<b>Job Failed</b>`,
    `${escapeHtml(summary.jobKey)} - ${escapeHtml(summary.executionId)}`,
    `${problemCount} problem(s): ${summary.failedCount} failed, ${summary.missingCount} missing` +
      (summary.unverifiedCount ? `, ${summary.unverifiedCount} unverified` : ""),
    `${summary.completedCount} completed, ${summary.skippedCount} skipped / ${summary.expectedCount} expected`,
  ];
  if (summary.dominantFailureCategory) {
    parts.push(`Dominant cause: ${escapeHtml(summary.dominantFailureCategory)}`);
  }
  parts.push(`Duration: ${duration}`);
  return parts.join("\n");
}

/**
 * Build a missed-start Telegram message.
 * @param {string} jobKey
 * @param {string} executionId
 * @returns {string} HTML-formatted message
 */
export function formatMissedStartSignal(jobKey, executionId) {
  return [
    `<b>Job Never Started</b>`,
    `${escapeHtml(jobKey)} - ${escapeHtml(executionId)}`,
    `No execution record found. The scheduled job may not have fired.`,
  ].join("\n");
}

/**
 * Build a crash-level failure message for immediate dispatch.
 * @param {string} jobKey
 * @param {string} executionId
 * @param {string} failureCategory
 * @param {string} [detail]
 * @returns {string}
 */
export function formatCrashSignal(jobKey, executionId, failureCategory, detail) {
  const parts = [
    `<b>Job Crashed</b>`,
    `${escapeHtml(jobKey)} - ${escapeHtml(executionId)}`,
    `Category: ${escapeHtml(failureCategory)}`,
  ];
  if (detail) parts.push(`Detail: ${escapeHtml(detail).slice(0, 200)}`);
  return parts.join("\n");
}

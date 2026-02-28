import { REPORT_PROMPT_DOCS } from "../config/reportConstants.js";

/**
 * Returns the default date range for report generation.
 * Academic year starts Nov 1, so:
 * - If current month is Nov or later → start = Nov 1 of current year
 * - If current month is before Nov  → start = Nov 1 of previous year
 * End is always "now".
 */
export function getDefaultDateRange(now = new Date()) {
  const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 10, 1); // Nov 1
  return { start, end: now };
}

/**
 * Parse the structured JSON response from GPT-4o report generation.
 * Expected shape: { reportText, sentimentScore, areaBalanceScore, missingInputFlags }
 */
export function parseReportResponse(rawContent) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("Failed to parse report response as JSON");
  }

  const reportText = typeof parsed.reportText === "string" ? parsed.reportText.trim() : "";
  if (!reportText) {
    throw new Error("reportText is missing or empty in AI response");
  }

  const sentimentScore = clampScore(parsed.sentimentScore);
  const areaBalanceScore = clampScore(parsed.areaBalanceScore);
  const missingInputFlags = Array.isArray(parsed.missingInputFlags)
    ? parsed.missingInputFlags.filter((f) => typeof f === "string")
    : [];

  return { reportText, sentimentScore, areaBalanceScore, missingInputFlags };
}

/**
 * Clamp a score to 1-5 range, or return null if not a valid number.
 */
function clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * Get the Firestore document ID for a program's report prompt.
 * Returns null if the program is not supported.
 */
export function getReportPromptDocId(programId) {
  if (!programId || typeof programId !== "string") return null;
  return REPORT_PROMPT_DOCS[programId] || null;
}

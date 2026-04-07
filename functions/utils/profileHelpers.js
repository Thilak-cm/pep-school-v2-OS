import { VALID_TRENDS } from "../config/profileConstants.js";

/**
 * Parse LLM profile response into structured dimension entries.
 *
 * The LLM returns a JSON object keyed by dimension key, each with:
 *   { narrative: string, confidence: number, evidenceCount: number, trend: string }
 *
 * This function validates, clamps, and fills missing dimensions with defaults.
 *
 * @param {Object} rawResponse - Parsed JSON from LLM keyed by dimension key
 * @param {Array} dimensions - Array of dimension config objects (from PROGRAM_DIMENSIONS)
 * @returns {Array} Array of { dimensionKey, dimensionLabel, narrative, structuredSignals }
 */
export function parseProfileResponse(rawResponse, dimensions) {
  return dimensions.map((dim) => {
    const entry = rawResponse?.[dim.key];
    const hasData = entry && typeof entry.narrative === "string" && entry.narrative.trim().length > 0;

    const narrative = hasData
      ? entry.narrative.trim()
      : "Insufficient observation data to build a profile for this dimension.";

    const rawConfidence = hasData ? Number(entry.confidence) : 0;
    const confidence = Number.isFinite(rawConfidence)
      ? Math.max(0, Math.min(1, rawConfidence))
      : 0;

    const evidenceCount = hasData && Number.isInteger(entry.evidenceCount) && entry.evidenceCount >= 0
      ? entry.evidenceCount
      : 0;

    const trend = hasData && VALID_TRENDS.includes(entry.trend)
      ? entry.trend
      : "emerging";

    return {
      dimensionKey: dim.key,
      dimensionLabel: dim.label,
      narrative,
      structuredSignals: {
        confidence,
        evidenceCount,
        trend,
        lastSourceType: "backfill",
      },
    };
  });
}

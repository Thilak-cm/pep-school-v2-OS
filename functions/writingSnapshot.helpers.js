/**
 * Pure helpers for the monthly writing snapshot feature (PEP-47).
 * Extracted from Cloud Function logic for testability without Firebase mocking.
 */

import { WRITING_SNAPSHOT_DEFAULTS } from "./config/writingSnapshotConstants.js";

const VALID_STAGES = [
  "scribbling",
  "pre-letter",
  "letter-forming",
  "letter-naming",
  "early-phonetic",
  "phonetic",
  "transitional",
  "conventional",
];

/**
 * Filters media docs to only handwritten photo samples within the month window.
 * @param {Object[]} mediaDocs - Raw media doc objects (with .data and .id)
 * @param {Date} windowStart - Inclusive lower bound (UTC)
 * @param {Date} windowEnd - Exclusive upper bound (UTC)
 * @returns {Object[]} Filtered and sorted (oldest first) media docs
 */
export function filterWritingSamples(mediaDocs, windowStart, windowEnd) {
  return mediaDocs
    .filter((doc) => {
      if (doc.mediaKind !== "photo") return false;
      if (doc.handwritten !== true) return false;
      const ts = doc.observedAt?.toDate?.() ?? doc.observedAt;
      if (!(ts instanceof Date) || isNaN(ts.getTime())) return false;
      return ts >= windowStart && ts < windowEnd;
    })
    .sort((a, b) => {
      const tsA = a.observedAt?.toDate?.() ?? a.observedAt;
      const tsB = b.observedAt?.toDate?.() ?? b.observedAt;
      return tsA - tsB;
    });
}

/**
 * Formats a writing sample's metadata for the VLM prompt (text portion).
 * @param {Object} doc - Filtered media doc
 * @param {number} index - 1-based sample index
 * @returns {string} Descriptive label for the image
 */
export function formatWritingSampleLabel(doc, index) {
  const ts = doc.observedAt?.toDate?.() ?? doc.observedAt;
  const dateStr = ts instanceof Date ? ts.toISOString().slice(0, 10) : "unknown";
  const copyLabel = doc.copied ? "copied" : "original";
  const comment = doc.teacherComment ? ` — "${doc.teacherComment}"` : "";
  return `Image ${index}: ${dateStr}, ${copyLabel}${comment}`;
}

/**
 * Determines the snapshot status based on sample count.
 * @param {number} sampleCount
 * @param {number} [minSamples]
 * @returns {"ok" | "insufficient_samples" | "no_samples"}
 */
export function determineSnapshotStatus(sampleCount, minSamples = WRITING_SNAPSHOT_DEFAULTS.minSamples) {
  if (sampleCount === 0) return "no_samples";
  if (sampleCount < minSamples) return "insufficient_samples";
  return "ok";
}

/**
 * Parses and validates the VLM JSON response for a writing snapshot.
 * @param {string} rawContent - Raw JSON string from VLM
 * @returns {Object} Parsed and validated result
 */
export function parseWritingSnapshotResponse(rawContent) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      analysis: "",
      stage: null,
      strengths: [],
      areasForGrowth: [],
    };
  }

  const analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";
  const stage = VALID_STAGES.includes(parsed.stage) ? parsed.stage : null;
  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.filter((s) => typeof s === "string")
    : [];
  const areasForGrowth = Array.isArray(parsed.areasForGrowth)
    ? parsed.areasForGrowth.filter((s) => typeof s === "string")
    : [];

  return { analysis, stage, strengths, areasForGrowth };
}

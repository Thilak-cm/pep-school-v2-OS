// Shared defaults for the parent report generation feature
import { FRONTIER_MODEL, MINI_MODEL } from "./modelConstants.js";

// Academic year starts on this month (0-indexed). Single source of truth.
export const AY_START_MONTH = 5; // June

export const REPORT_DEFAULTS = {
  model: FRONTIER_MODEL,
  temperature: 0.7,
  max_tokens: 4096,
  timezone: "Asia/Kolkata",
};

// Supported programs and their Firestore prompt doc IDs
export const REPORT_PROMPT_DOCS = {
  adolescent: "term_report_adolescent",
  elementary: "term_report_elementary",
  primary: "term_report_primary",
  toddler: "term_report_toddler",
};

// Monthly/baseline report prompt doc IDs (PEP-325)
export const BASELINE_REPORT_PROMPT_DOCS = {
  adolescent: "baseline_report_adolescent",
  elementary: "baseline_report_elementary",
  primary: "baseline_report_primary",
  toddler: "baseline_report_toddler",
};

// Baseline report judge prompt doc IDs (#152)
export const BASELINE_JUDGE_PROMPT_DOCS = {
  adolescent: "baseline_judge_adolescent",
  elementary: "baseline_judge_elementary",
  primary: "baseline_judge_primary",
  toddler: "baseline_judge_toddler",
};

export const JUDGE_DEFAULTS = {
  model: MINI_MODEL,
  temperature: 0.3,
  max_tokens: 1024,
};

// Report readiness checker (PEP-68)
// Fan-out: each report type gets its own readiness doc (#152)
const READINESS_DOC_IDS = {
  term: "term_report_readiness",
  baseline: "baseline_report_readiness",
};

/**
 * Get the Firestore doc ID for a report type's readiness scores.
 * @param {string} [reportType="term"] - "term" or "baseline"
 */
export function getReadinessDocId(reportType) {
  return READINESS_DOC_IDS[reportType] || READINESS_DOC_IDS.term;
}

export const READINESS_PROMPT_DOCS = {
  adolescent: "readiness_adolescent",
  elementary: "readiness_elementary",
  primary: "readiness_primary",
  toddler: "readiness_toddler",
};

export const READINESS_DEFAULTS = {
  model: MINI_MODEL,
  temperature: 0.3,
  max_tokens: 1024,
};

// Hardcoded term label for CSV filenames (PEP-83).
// TODO: auto-detect Term 1 (March) vs Term 2 (October) from report date range.
export const HARDCODED_TERM = "March 2026";

/**
 * Build the classroom-specific summary CSV filename.
 * Format: "{Classroom Name} | {Term} | Report Consolidation Summary.csv"
 */
export function buildCsvFilename(classroomName) {
  return `${classroomName} | ${HARDCODED_TERM} | Report Consolidation Summary.csv`;
}

/**
 * Build the classroom-specific archive CSV filename.
 * Format: "{Classroom Name} | {Term} | Report Consolidation Summary Archive.csv"
 */
export function buildArchiveCsvFilename(classroomName) {
  return `${classroomName} | ${HARDCODED_TERM} | Report Consolidation Summary Archive.csv`;
}

/**
 * Build the classroom-specific baseline report CSV filename.
 * Format: "{Classroom Name} | {Month Year} | Baseline Report Summary.csv"
 */
export function buildBaselineCsvFilename(classroomName, now = new Date()) {
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return `${classroomName} | ${monthYear} | Baseline Report Summary.csv`;
}

/**
 * Build the classroom-specific baseline archive CSV filename.
 * Format: "{Classroom Name} | {Month Year} | Baseline Report Summary Archive.csv"
 */
export function buildBaselineArchiveCsvFilename(classroomName, now = new Date()) {
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return `${classroomName} | ${monthYear} | Baseline Report Summary Archive.csv`;
}

// Google Drive export constants
export const DRIVE_CONSTANTS = {
  sharedDriveId: "0ANF5MPbc7nZEUk9PVA",
  // Legacy filename — kept for migration search (PEP-83)
  csvFilename: "Report Consolidation Summary.csv",
  csvHeaders: [
    "Child Name",
    "Branch",
    "Program",
    "Classroom",
    "Generation Date",
    "Author",
    "Sentiment Score",
    "Area Balance Score",
    "Missing Input Flags",
    "Google Doc Link",
  ],
};

// Google Doc formatting constants (colors as Google Docs API RGB fractions 0-1)
export const DOC_STYLE = {
  // Student name heading — navy blue
  nameColor: { red: 21 / 255, green: 101 / 255, blue: 192 / 255 }, // #1565C0
  nameFontSize: 18,
  // Metadata line — pink/magenta
  metaColor: { red: 194 / 255, green: 24 / 255, blue: 91 / 255 }, // #C2185B
  metaFontSize: 11,
  // Section headings — dark navy
  headingColor: { red: 13 / 255, green: 71 / 255, blue: 161 / 255 }, // #0D47A1
  headingFontSize: 14,
  // Body text — dark grey
  bodyColor: { red: 51 / 255, green: 51 / 255, blue: 51 / 255 }, // #333333
  bodyFontSize: 11,
  // Spacing (points)
  headingSpaceAbove: 14,
  headingSpaceBelow: 4,
  bodySpaceAfter: 6,
  metaSpaceBelow: 18,
  // Logo dimensions (points)
  logoWidth: 200,
  logoHeight: 200,
  // Font
  fontFamily: "Roboto",
};

// PEP School logo — hosted on Firebase Storage at assets/branding/ (public via GCS ACL)
// NOTE: Must be PNG/JPEG/GIF — Google Docs API rejects WebP for insertInlineImage.
// NOTE: Use storage.googleapis.com (GCS direct) URL, NOT firebasestorage.googleapis.com
// — the Firebase REST URL applies Storage security rules and returns 403.
export const LOGO_URL = "https://storage.googleapis.com/pep-os.firebasestorage.app/assets/branding/pep-logo.png";

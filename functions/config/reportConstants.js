// Shared defaults for the parent report generation feature
import { FRONTIER_MODEL, MINI_MODEL } from "./modelConstants.js";

export const REPORT_DEFAULTS = {
  model: FRONTIER_MODEL,
  temperature: 0.7,
  max_tokens: 4096,
  timezone: "Asia/Kolkata",
  // Default date range: Nov 1 of previous academic year → today
  defaultStartMonth: 10, // 0-indexed: November
  defaultStartDay: 1,
};

// Supported programs and their Firestore prompt doc IDs (term reports)
export const REPORT_PROMPT_DOCS = {
  adolescent: "report_adolescent",
  elementary: "report_elementary",
  primary: "report_primary",
  toddler: "report_toddler",
};

// Baseline report prompt docs (PEP-325) — fully independent from the term docs.
// One dedicated doc per program; same shape (staticSystemPrompt + dynamicSystemPrompt).
export const REPORT_BASELINE_PROMPT_DOCS = {
  adolescent: "report_baseline_adolescent",
  elementary: "report_baseline_elementary",
  primary: "report_baseline_primary",
  toddler: "report_baseline_toddler",
};

// Report readiness checker (PEP-68)
export const READINESS_DOC_ID = "report_readiness";

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

// Baseline reports (PEP-325) get their own consolidation CSVs, kept separate
// from term reports so the two report types never share a summary file.
export const BASELINE_CSV_LABEL = "Baseline";

/**
 * The label segment used in consolidation CSV filenames, by report type.
 * Term (default) → hardcoded term label; baseline → "Baseline".
 */
export function csvTermLabel(reportType = "term") {
  return reportType === "baseline" ? BASELINE_CSV_LABEL : HARDCODED_TERM;
}

/**
 * Build the classroom-specific summary CSV filename.
 * Format: "{Classroom Name} | {Label} | Report Consolidation Summary.csv"
 */
export function buildCsvFilename(classroomName, reportType = "term") {
  return `${classroomName} | ${csvTermLabel(reportType)} | Report Consolidation Summary.csv`;
}

/**
 * Build the classroom-specific archive CSV filename.
 * Format: "{Classroom Name} | {Label} | Report Consolidation Summary Archive.csv"
 */
export function buildArchiveCsvFilename(classroomName, reportType = "term") {
  return `${classroomName} | ${csvTermLabel(reportType)} | Report Consolidation Summary Archive.csv`;
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

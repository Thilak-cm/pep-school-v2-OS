// Shared defaults for the parent report generation feature
import { FRONTIER_MODEL } from "./modelConstants.js";

export const REPORT_DEFAULTS = {
  model: FRONTIER_MODEL,
  temperature: 0.7,
  max_tokens: 4096,
  timezone: "Asia/Kolkata",
  // Default date range: Nov 1 of previous academic year → today
  defaultStartMonth: 10, // 0-indexed: November
  defaultStartDay: 1,
};

// Supported programs and their Firestore prompt doc IDs
export const REPORT_PROMPT_DOCS = {
  adolescent: "report_adolescent",
  elementary: "report_elementary",
  // primary: "report_primary", // TBD — prompt not yet available
};

// Concurrency limit for bulk report generation
export const REPORT_BULK_CONCURRENCY = 5;

// Google Drive export constants
export const DRIVE_CONSTANTS = {
  sharedDriveId: "0ANF5MPbc7nZEUk9PVA",
  csvFilename: "Report Consolidation Summary.csv",
  csvHeaders: [
    "Child Name",
    "Branch",
    "Program",
    "Classroom",
    "Generation Date",
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
  logoWidth: 80,
  logoHeight: 80,
};

// PEP School logo — hosted on Firebase Storage (public download URL)
// Upload via: gsutil cp "pep school logo.webp" gs://pep-os.firebasestorage.app/branding/logo.webp
// Then set public: gsutil acl ch -u AllUsers:R gs://pep-os.firebasestorage.app/branding/logo.webp
export const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/pep-os.firebasestorage.app/o/branding%2Flogo.webp?alt=media";

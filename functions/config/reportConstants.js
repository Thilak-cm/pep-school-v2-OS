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

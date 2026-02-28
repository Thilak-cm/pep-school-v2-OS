// Shared defaults for the parent report generation feature
export const REPORT_DEFAULTS = {
  model: "gpt-4o",
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

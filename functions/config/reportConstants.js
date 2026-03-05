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
  primary: "report_primary",
  toddler: "report_toddler",
};

// Concurrency limit for bulk report generation
export const REPORT_BULK_CONCURRENCY = 5;

// Branding for Google Doc report template
const STORAGE_BASE = "https://storage.googleapis.com/pep-os.firebasestorage.app/assets/branding";
export const REPORT_BRANDING = {
  assets: {
    logoUrl: `${STORAGE_BASE}/pep-logo.png`,
    footerUrl: `${STORAGE_BASE}/footer-pattern.png`,
    headerFirstPageUrl: `${STORAGE_BASE}/header-first-page.png`,
    headerDefaultUrl: `${STORAGE_BASE}/header-default.png`,
  },
  colors: {
    studentName: { red: 0.10, green: 0.14, blue: 0.49 }, // Dark navy (#1A237E)
    subtitle: { red: 0.19, green: 0.22, blue: 0.57 }, // Indigo 800 (#303F9F)
    heading: { red: 0.13, green: 0.13, blue: 0.13 }, // Near-black
  },
  fonts: {
    heading: "Montserrat",
    body: "Georgia",
    studentNameSize: 24,
    subtitleSize: 10,
    headingSize: 13,
    bodySize: 11,
  },
  dimensions: {
    // Logo: 1500×269px → scaled to ~150pt wide, preserve aspect ratio
    logoPt: { width: 150, height: 27 },
    // Footer: 2029×279px → full US-Letter width 612pt, preserve aspect ratio
    footerPt: { width: 612, height: 84 },
    // First-page header corner: 800×800px → 80pt square
    headerFirstPagePt: { width: 80, height: 80 },
    // Default header corner: 300×300px → 45pt square
    headerDefaultPt: { width: 45, height: 45 },
  },
};

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

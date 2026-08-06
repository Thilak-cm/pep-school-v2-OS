/**
 * Tool catalog metadata — shared between functions and frontend (PEP-304).
 *
 * This file contains only static metadata (no Firestore imports) so it can
 * be imported by the testbench Vite app via fs.allow cross-boundary import.
 */

export const TOOL_CATALOG_META = [
  {
    id: "fetch_weekly_snapshot",
    scope: "student",
    label: "Weekly Snapshot",
    description: "Full narrative summary for a student's current weekly snapshot",
    defaultEnabled: true,
  },
  {
    id: "fetch_snapshot_history",
    scope: "student",
    label: "Snapshot History",
    description: "Previous weekly snapshots for trend analysis",
    prerequisites: ["fetch_weekly_snapshot"],
    defaultEnabled: true,
  },
  {
    id: "fetch_soul",
    scope: "student",
    label: "Soul Narrative",
    description: "AI-generated holistic description of who the child is",
    defaultEnabled: false,
  },
  {
    id: "fetch_monthly_plan",
    scope: "student",
    label: "Monthly Plan",
    description: "Current monthly prescribed activities and goals",
    defaultEnabled: true,
  },
  {
    id: "fetch_writing_analysis",
    scope: "student",
    label: "Writing Analysis",
    description: "Latest handwriting assessment and progression",
    defaultEnabled: true,
  },
  {
    id: "fetch_interviews",
    scope: "student",
    label: "Interviews",
    description: "Recent interview transcripts",
    defaultEnabled: true,
  },
  {
    id: "fetch_observations",
    scope: "student",
    label: "Observations",
    description: "Recent observation texts (text, voice, lesson notes)",
    defaultEnabled: true,
  },
  {
    id: "fetch_media",
    scope: "student",
    label: "Media",
    description: "Recent media uploads (photos, PDFs) with metadata",
    defaultEnabled: true,
  },
  {
    id: "fetch_term_reports",
    scope: "student",
    label: "Term Reports",
    description: "Generated parent-facing term progress reports",
    defaultEnabled: true,
  },
  {
    id: "fetch_baseline_reports",
    scope: "student",
    label: "Baseline Reports",
    description: "Generated parent-facing baseline reports",
    defaultEnabled: true,
  },
  {
    id: "fetch_placements",
    scope: "student",
    label: "Placement History",
    description: "Classroom placement history for the student",
    defaultEnabled: true,
  },
  {
    id: "fetch_chat_history",
    scope: "student",
    label: "Chat History",
    description: "Older messages from the current chat thread",
    defaultEnabled: true,
  },
];

export const DEFAULT_CHAT_TOOL_IDS = TOOL_CATALOG_META
  .filter((tool) => tool.scope === "student" && tool.defaultEnabled)
  .map((tool) => tool.id);

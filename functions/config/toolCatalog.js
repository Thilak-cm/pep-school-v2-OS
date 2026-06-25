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
  },
  {
    id: "fetch_snapshot_history",
    scope: "student",
    label: "Snapshot History",
    description: "Previous weekly snapshots for trend analysis",
    prerequisites: ["fetch_weekly_snapshot"],
  },
  {
    id: "fetch_soul",
    scope: "student",
    label: "Soul Narrative",
    description: "AI-generated holistic description of who the child is",
  },
  {
    id: "fetch_monthly_plan",
    scope: "student",
    label: "Monthly Plan",
    description: "Current monthly prescribed activities and goals",
  },
  {
    id: "fetch_writing_analysis",
    scope: "student",
    label: "Writing Analysis",
    description: "Latest handwriting assessment and progression",
  },
  {
    id: "fetch_interviews",
    scope: "student",
    label: "Interviews",
    description: "Recent interview transcripts",
  },
  {
    id: "fetch_observations",
    scope: "student",
    label: "Observations",
    description: "Recent observation texts (text, voice, lesson notes)",
  },
  {
    id: "fetch_media",
    scope: "student",
    label: "Media",
    description: "Recent media uploads (photos, PDFs) with metadata",
  },
];

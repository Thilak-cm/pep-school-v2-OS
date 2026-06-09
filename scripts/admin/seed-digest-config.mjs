#!/usr/bin/env node
/**
 * Seed config/weekly_digest Firestore doc for e2e testing (PEP-297).
 *
 * Usage: node scripts/admin/seed-digest-config.mjs
 *
 * Creates the config doc with testOverrideEmails so all digest emails
 * go to test recipients only. Remove testOverrideEmails field (or set
 * to null) when ready for production.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pep-os",
});

const db = getFirestore();

const config = {
  // LLM settings
  model: "openai/gpt-4.1-mini",
  temperature: 0.4,
  max_tokens: 4000,

  // System prompts — editable via testbench for prompt iteration (PEP-304)
  classroomPrompt: `You are a Montessori school assistant generating a weekly classroom digest email for a classroom administrator.

You receive structured data about ONE classroom: teacher activity stats, student note counts for the past 7 days, and contextual notes from the school administration providing important background (e.g., teacher roles, school calendar events, known situations). You also have tools to investigate individual students more deeply.

Your job:
1. Review the stats provided and any contextual notes. Identify anomalies — students with sudden drops in notes, teachers with zero activity, students with very low coverage.
2. Use your tools to investigate. Start with fetch_weekly_snapshot for students who look concerning. If a snapshot shows escalation or red flags, dig deeper with fetch_snapshot_history, fetch_soul, or fetch_observations.
3. Once you have enough context, produce a concise, actionable HTML email body.

Output rules:
- **Title:** Use the format "<full month name> Week <number> Digest — <Classroom Name>" as the email heading (e.g., "Month June Week 2 Digest — Periwinkle").
- **No greetings or sign-offs.** Do not start with "Dear Team" or end with "Best regards." Get right into the content.
- **Red-flagged students must be prominently called out.** Use bold text and warning colors. These are urgent.
- **Escalated students** (medium/high severity) should be highlighted with context on why.
- **Inactive teachers** (zero notes this week) must be named explicitly.
- **Anomalies over time** — if a student went from lots of notes to none, say so. If a teacher's output dropped, flag it.
- **Never say "and several others" or "among others."** Always list every student or teacher by name. Be exhaustive and specific.
- **Tone:** Professional but warm. You are a co-pilot for the manager.
- **Format:** Output valid HTML (no <html>/<head>/<body> tags — just inner content). Use inline styles. Centre-aligned, blog-post style layout with max-width 600px. Mobile-friendly.
- **Do not invent information.** Only reference data you received or fetched via tools.
- **Respect contextual notes.** If the notes say a teacher is administrative (not teaching), do not flag them for inactivity. If a school break is mentioned, adjust your analysis accordingly.
- **Keep it brief.** Lead with what needs attention. A quiet week gets a short "all clear."`,

  superadminPrompt: `You are a Montessori school assistant generating a consolidated weekly digest email for a superadmin who oversees ALL classrooms across the school.

You receive the individual classroom digest summaries that were already generated for each classroom, plus contextual notes from the school administration providing important background. You also have tools to investigate specific students if needed.

Your job:
1. Synthesize the classroom digests into ONE consolidated email.
2. Highlight the most critical items across all classrooms — red flags, escalations, inactive teachers.
3. Identify cross-classroom patterns if any (e.g., multiple classrooms with inactive teachers, school-wide observation drop).
4. Use tools only if you need to verify something or dig deeper into a specific case.

Output rules:
- **Title:** Use the format "Executive Digest for <full month name> Week <number>" as the email heading (e.g., "Weekly Executive Digest — Month June Week 2").
- **No greetings or sign-offs.** Do not start with "Dear Team" or end with "Best regards." Get right into the content.
- **Lead with the most urgent items** — red flags first, then escalations, then general notes.
- **Group by classroom** but don't just repeat each digest. Summarize and prioritize.
- **Cross-classroom insights** are your unique value — no individual digest has this view.
- **Never say "and several others" or "among others."** Always list every teacher and student by name. Be exhaustive and specific.
- **Tone:** Executive summary for leadership. Concise, direct, actionable.
- **Format:** Valid HTML, inline styles, centre-aligned blog-post style layout with max-width 700px. Mobile-friendly. No <html>/<head>/<body> tags.
- **Respect contextual notes.** If the notes say a teacher is administrative, do not flag them for inactivity. If a school break is mentioned, adjust analysis accordingly.
- **Keep it tight.** This covers ~20 classrooms — be ruthlessly concise.`,

  // Contextual notes — school-specific context injected into every
  // agent's first user message. Editable by superadmins via settings page.
  contextualNotes: `- Diana D'Souza is an administrative teacher — she handles operations, not classroom teaching. Do not flag her for note-taking inactivity.
- Anil Kumar S is a support staff member, not a classroom teacher. Ignore his note counts.
- The school was on summer break for April and May 2026. A dip in notes for most students during this period is expected, except for students in the summer program.
- Argus, Orion and Sirius classrooms are new classrooms that started recently — lower activity is expected as they ramp up.`,

  // Agent tool permissions (PEP-304)
  allowedToolScopes: ["student"],
  allowedTools: [
    "fetch_weekly_snapshot",
    "fetch_snapshot_history",
    "fetch_soul",
    "fetch_monthly_plan",
    "fetch_writing_analysis",
    "fetch_interviews",
    "fetch_observations",
    "fetch_media",
  ],

  // Enable test trigger via callable function
  enableTestTrigger: true,

  // Test mode — all emails go to these addresses only.
  // Remove this field for production.
  testOverrideEmails: [
    "testteacher@pepschoolv2.com",
    "thilak@pepschoolv2.com",
  ],

  // Superadmin classroom overrides — these superadmins also get
  // per-classroom emails for the listed classrooms.
  superadminClassroomOverrides: {
    "HA1TiA1xbkRJ8n1MPaBi1PdGlo92": ["allstars"],  // Rahul → allstars
  },
};

async function main() {
  const ref = db.collection("config").doc("weekly_digest");
  const existing = await ref.get();

  if (existing.exists) {
    console.log("config/weekly_digest already exists. Current data:");
    console.log(JSON.stringify(existing.data(), null, 2));
    console.log("\nOverwriting with new config...");
  }

  await ref.set(config, { merge: true });
  console.log("\nconfig/weekly_digest seeded:");
  console.log(JSON.stringify(config, null, 2));
  console.log("\nDone. testOverrideEmails is active — all emails go to test recipients only.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

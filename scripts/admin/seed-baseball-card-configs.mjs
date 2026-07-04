#!/usr/bin/env node
/**
 * Seed per-program baseball card config docs (PEP-132).
 *
 * Creates: config/baseball_card_primary, config/baseball_card_toddler,
 *          config/baseball_card_elementary, config/baseball_card_adolescent
 *
 * Marks config/baseball_card as deprecated (adds _deprecated field).
 *
 * Idempotent: skips docs that already exist unless --force is passed.
 *
 * Usage:
 *   node scripts/admin/seed-baseball-card-configs.mjs          # dry run
 *   node scripts/admin/seed-baseball-card-configs.mjs --apply  # write to Firestore
 *   node scripts/admin/seed-baseball-card-configs.mjs --force --apply  # overwrite existing
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pep-os",
});

const db = getFirestore();

const applyMode = process.argv.includes("--apply");
const forceMode = process.argv.includes("--force");

// ── Per-program domain lists (confirmed by Rahul, derived from term reports) ──

const PROGRAM_DOMAINS = {
  toddler: ["Practical Life", "Social-Emotional", "Language & Literacy", "Mathematics & Sensorial"],
  primary: ["Practical Life", "Social-Emotional", "Language & Literacy", "Mathematics & Sensorial"],
  elementary: ["Language Arts", "Mathematics", "Sciences & Cultural Studies", "Creative Arts"],
  adolescent: ["Mathematics", "Language & Humanities", "Sciences", "Enterprise & Applied Learning", "Social Development"],
};

// ── Build per-program system prompt ───────────────────────────────────

function buildSystemPrompt(programId) {
  const domains = PROGRAM_DOMAINS[programId];
  const domainList = domains.join(", ");

  return `You are Coach Pepper. Your job is to generate an evidence-based, staff-facing summary for ONE student named <STUDENT_NAME> (<STUDENT_AGE>) using ONLY the notes provided. Some notes may mention other students—intelligently exclude or ignore any information about students other than <STUDENT_NAME> so signals stay focused on the student in scope.

INPUT:
Notes: JSON array of observation notes from the last <WINDOW_DAYS> days for one student. Each note includes: text, observedAt, studentId, and other metadata.

OUTPUT:
Return exactly one JSON object with this schema:

{
  "summary": "2-3 paragraph staff-facing summary",
  "redFlag": {
    "severity": "low" | "medium" | "high" | null,
    "reason": "brief explanation or null"
  },
  "coverageGaps": []
}

HARD RULES
- Use ONLY the provided notes. Do not invent events, dates, skills, diagnoses, causes, or next steps.
- Every claim must be supported by one or more notes. If evidence is weak/limited, say so plainly.
- Include dates naturally in the summary (e.g., "On Dec 4…", "In early November…").
- Keep it concise: 2–3 paragraphs, 3–5 sentences each. Active voice. Professional internal staff tone (not parent-facing).
- Do NOT prescribe interventions or next steps.
- CRITICAL: Always consider the student's age (<STUDENT_AGE>) when evaluating behaviors, skills, and concerns. The same behavior may be developmentally appropriate for a younger child but concerning for an older child. Factor developmental expectations into all judgments about red flags, academic progress, and social-emotional patterns.

SUMMARY STRUCTURE
Paragraph 1 — Academic / classroom work:
- Lead with the most frequently observed academic/domain areas present in the notes.
- Mention specific Montessori materials/activities when named. Describe trajectory (emerging/consistent/variable) only if repeated evidence exists.
- When relevant, note whether observed skills/behaviors align with age-expected developmental milestones for a <STUDENT_AGE> child.

Paragraph 2 — Social-emotional / learning behaviors:
- Focus, independence, work cycle completion, transitions, peer interactions, regulation.
- Describe patterns only if repeated; otherwise describe as "observed once" or "limited data".
- Consider whether behaviors are developmentally appropriate for the student's age; note when patterns may be typical or atypical relative to age expectations.

Paragraph 3 (optional) — Cross-cutting themes:
- Only include if a clear theme appears across multiple notes (e.g., repeated persistence, repeated frustration in transitions, repeated preference for certain work types).
- When age-relevant, contextualize themes within developmental expectations.

COVERAGE GAPS
- The curriculum domains for this program are: ${domainList}.
- Determine which of these domains have ZERO observations in the provided window (based on note content).
- If coverage is complete, return an empty array [].
- Only report gaps from the domains listed above. Do not invent or add domains not listed.

RED FLAG LOGIC (set severity + reason)
- Use null severity + null reason if there is no concern AND coverage is adequate.
- CRITICAL: Evaluate severity relative to the student's age (<STUDENT_AGE>). A behavior that is typical for a 5-year-old may be concerning for a 10-year-old. Consider developmental norms when assessing whether behaviors, skills, or patterns warrant concern.
- HIGH: safety risks (aggression, elopement, dangerous behavior), severe/frequent dysregulation, prolonged refusal to engage, significant regression in previously mastered skills, OR behaviors/skills that are developmentally inappropriate for the student's age.
- MEDIUM: persistent social conflict/isolation, consistent avoidance of a key academic area, emotional patterns clearly affecting learning, significant foundational gaps that repeatedly block engagement, OR behaviors that are somewhat below age-expected developmental milestones.
- LOW: emerging concerns (inconsistent engagement, mild but repeated peer friction, variable regulation), OR "dog that didn't bark" (a major expected domain absent across a sufficiently long window with otherwise reasonable coverage), OR minor developmental delays relative to age expectations.
- If severity is LOW/MEDIUM/HIGH, the reason must be one short sentence that references the pattern and (when possible) time range (e.g., "Across late Nov–Dec…"). If it's primarily a coverage issue, say that explicitly ("Observation gap…"). When age-appropriateness is a factor, briefly note it (e.g., "Behavior typical for younger children but concerning at this age").

QUALITY CHECK BEFORE YOU OUTPUT
- Ensure output is one JSON object only, and that it is valid.
- Ensure coverageGaps is an array (possibly empty), never null. Only include domains from the list: ${domainList}.
- Ensure redFlag.severity is one of: low, medium, high, null.
- Ensure redFlag.reason is null when severity is null.
`;
}

// ── Shared model config (same across all programs today) ──────────────

const SHARED_CONFIG = {
  model: "gpt-5.4-mini",
  temperature: 0,
  max_tokens: 600,
  windowDays: 42,
  timezone: "Asia/Kolkata",
};

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${applyMode ? "APPLY" : "DRY RUN"} ${forceMode ? "(force)" : ""}`);
  console.log("");

  for (const programId of Object.keys(PROGRAM_DOMAINS)) {
    const docId = `baseball_card_${programId}`;
    const ref = db.collection("config").doc(docId);

    const existing = await ref.get();
    if (existing.exists && !forceMode) {
      console.log(`  SKIP ${docId} — already exists (use --force to overwrite)`);
      continue;
    }

    const doc = {
      ...SHARED_CONFIG,
      systemPrompt: buildSystemPrompt(programId),
      programId,
      title: "Coach Pepper's summary",
      description: `Last ${SHARED_CONFIG.windowDays} days baseball card summary — ${programId}`,
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: "seed-baseball-card-configs.mjs (PEP-132)",
    };

    if (applyMode) {
      await ref.set(doc);
      console.log(`  CREATED ${docId}`);
    } else {
      console.log(`  WOULD CREATE ${docId} (${PROGRAM_DOMAINS[programId].join(", ")})`);
    }
  }

  // Deprecate old config/baseball_card
  const oldRef = db.collection("config").doc("baseball_card");
  const oldSnap = await oldRef.get();
  if (oldSnap.exists) {
    if (applyMode) {
      await oldRef.update({
        _deprecated: true,
        _deprecatedAt: new Date().toISOString(),
        _deprecatedReason: "Replaced by per-program docs (PEP-132): baseball_card_primary, baseball_card_toddler, baseball_card_elementary, baseball_card_adolescent",
      });
      console.log("\n  DEPRECATED config/baseball_card");
    } else {
      console.log("\n  WOULD DEPRECATE config/baseball_card");
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

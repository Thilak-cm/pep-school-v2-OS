/**
 * Seed baseline report prompts to Firestore (PEP-325).
 *
 * Writes one dedicated config doc per program:
 *   config/report_baseline_adolescent
 *   config/report_baseline_elementary
 *   config/report_baseline_primary
 *   config/report_baseline_toddler
 *
 * These are FULLY INDEPENDENT from the term report docs (config/report_{program}).
 * The baseline report is the "first month / new joiner" parent report — it reassures
 * families their child is settling in, rather than summarizing a full term of academic
 * progress. There is no fallback: the baseline CF throws if its doc is missing.
 *
 * Each doc uses the same shape the report CF reads:
 *   - staticSystemPrompt  → the ETERNAL prompt (timeless: philosophy, structure, tone)
 *   - dynamicSystemPrompt → the INSTANCE prompt (per-cycle: year/term/type nuances)
 *   - model, temperature, max_tokens, timezone, title, description, version
 *
 * These are starter prompts authored for initial seeding. Rahul will iterate on them
 * via the prompt test bench (PEP-299) and promote a converged version later.
 *
 * Usage:
 *   node scripts/admin/seed-baseline-report-prompts.mjs            # dry run (default)
 *   node scripts/admin/seed-baseline-report-prompts.mjs --apply    # write to Firestore
 *   node scripts/admin/seed-baseline-report-prompts.mjs --verify   # check existing docs
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const verify = args.includes("--verify");

// ── ETERNAL prompt (shared) ──────────────────────────────────────────────────
// Timeless: works for every child, every baseline report, every year. This is the
// part that "is still there in five years." Per-cycle nuances live in the INSTANCE
// (dynamic) prompt below, never here.
const ETERNAL_CORE = `You are an experienced Montessori guide writing a BASELINE report for a child who has recently joined the school (or moved into a new program). This is the family's first written report — often their first month — so its purpose is different from a term report.

## Purpose
- Reassure the family that their child is settling in and is known and seen as an individual.
- Describe WHO the child is becoming in the prepared environment, not how they "score."
- Set warm, realistic expectations for the months ahead.

## What this report is NOT
- It is not a term progress report and must not imply a full term of data.
- It is not an academic grading or assessment. Do not assign levels, grades, or rankings.
- It must never invent observations, milestones, or abilities that are not supported by the notes provided. With a new child, sparse data is normal — say less rather than fabricate.

## Grounding rules
- Use ONLY the observations provided for this child. Quote concrete moments where possible.
- If evidence in an area is thin, frame it as "early days" and describe what you are watching for, rather than inventing progress.
- Most recent observations carry the most weight.

## Structure (use ## section headers)
1. Settling In — how the child is adjusting to the environment, routines, and people.
2. Engagement & Interests — what has drawn the child's attention; materials or activities they return to.
3. Social & Emotional — connection with peers and adults, comfort, and emotional rhythms.
4. Growing Independence — self-care, practical life, and ownership appropriate to the child.
5. Looking Ahead — what the family can expect next, and one or two simple, supportive things they can do at home.

## Tone
- Warm, specific, and human. Write to a parent, not a committee.
- Avoid Montessori jargon unless you immediately explain it in plain language.
- Concrete over generic: never use filler like "is doing well" or "is a joy" without an observed example.
- 2-4 short paragraphs total across the sections; this is a baseline, not an exhaustive review.`;

// Program-specific developmental lens, appended to the eternal core.
const PROGRAM_LENS = {
  toddler: `## Program lens — Toddler (under ~3)
- Center the report on separation/attachment, trust, and comfort with new caregivers.
- Notice emerging language, gross/fine motor exploration, and engagement with practical life (pouring, carrying, self-feeding).
- Treat toileting, sleep, and eating routines sensitively and only if observed.
- Settling in is the headline at this age — a calm, connected child is the goal, not "work output."`,

  primary: `## Program lens — Primary (~3-6)
- Focus on concentration, the work cycle, and the child's first chosen activities (often practical life and sensorial).
- Notice grace & courtesy, care of the environment, and how the child enters the community.
- Mention emerging interests in language or math only where observed — never imply a curriculum sequence the child hasn't begun.
- The headline is a child who is settling, concentrating, and forming relationships.`,

  elementary: `## Program lens — Elementary (~6-12)
- Focus on how the child is joining the community: collaboration, friendships, and finding their place.
- Notice curiosity, the questions they ask, work habits, and willingness to take initiative.
- Acknowledge the bigger transition for children who moved up from primary — belonging and confidence come first.
- The headline is a child who is finding their footing socially and intellectually, not a list of academic outputs.`,

  adolescent: `## Program lens — Adolescent (~12+)
- Focus on belonging, self-direction, and how the young person is integrating socially and into the community's responsibilities.
- Notice engagement, emerging areas of ownership, and how they respond to independence and expectations.
- Be especially careful not to over-read a few weeks of data; name what you are still getting to know.
- The headline is a young person settling into a new community and beginning to take ownership.`,
};

// ── INSTANCE prompt (per-program, editable per cycle) ────────────────────────
// Year/term/type-specific nuances. This is the part that changes each cycle and is
// safe for admins to edit without touching the eternal prompt. Seeded intentionally
// light — fill in cohort/teacher/language nuances here as they arise.
function instancePrompt(programLabel) {
  return `## Instance notes (current cycle — edit me, not the eternal prompt)
- This is a baseline report for the current intake of newly joined ${programLabel} children.
- If observations are written by a specific guide, weigh language/context accordingly (add cohort- or teacher-specific notes here as needed).
- Keep expectations calibrated to "first month": prefer fewer, well-evidenced statements over breadth.`;
}

const PROGRAM_LABELS = {
  toddler: "toddler",
  primary: "primary",
  elementary: "elementary",
  adolescent: "adolescent",
};

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

function buildConfig(program) {
  const label = PROGRAM_LABELS[program];
  return {
    staticSystemPrompt: `${ETERNAL_CORE}\n\n${PROGRAM_LENS[program]}`,
    dynamicSystemPrompt: instancePrompt(label),
    title: `Baseline Report — ${label.charAt(0).toUpperCase() + label.slice(1)}`,
    description: `Baseline (new-joiner / first-month) parent report prompt for the ${label} program (PEP-325). Independent of the term report. staticSystemPrompt = eternal; dynamicSystemPrompt = per-cycle instance notes.`,
    model: "gpt-5.4",
    temperature: 0.7,
    max_tokens: 4096,
    timezone: "Asia/Kolkata",
    version: 1,
  };
}

async function run() {
  if (verify) {
    for (const program of PROGRAMS) {
      const docId = `report_baseline_${program}`;
      const snap = await db.collection("config").doc(docId).get();
      if (!snap.exists) {
        console.log(`config/${docId} does NOT exist`);
      } else {
        const data = snap.data();
        console.log(`config/${docId} EXISTS`);
        console.log(`  model: ${data.model}  temp: ${data.temperature}  max_tokens: ${data.max_tokens}`);
        console.log(`  staticSystemPrompt: ${data.staticSystemPrompt?.length || 0} chars`);
        console.log(`  dynamicSystemPrompt: ${data.dynamicSystemPrompt?.length || 0} chars`);
      }
    }
    return;
  }

  for (const program of PROGRAMS) {
    const docId = `report_baseline_${program}`;
    const cfg = buildConfig(program);
    console.log(`\nconfig/${docId}`);
    console.log(`  title: ${cfg.title}`);
    console.log(`  model: ${cfg.model}  temp: ${cfg.temperature}  max_tokens: ${cfg.max_tokens}`);
    console.log(`  staticSystemPrompt: ${cfg.staticSystemPrompt.length} chars`);
    console.log(`  dynamicSystemPrompt: ${cfg.dynamicSystemPrompt.length} chars`);

    if (!apply) continue;

    const now = new Date();
    await db.collection("config").doc(docId).set({
      ...cfg,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }, { merge: true });
    console.log(`  → written to config/${docId}`);
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to write to Firestore");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

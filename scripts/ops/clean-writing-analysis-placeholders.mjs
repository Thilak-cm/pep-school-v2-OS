/**
 * Remove dead {{placeholder}} template variables from writing analysis
 * system prompts in Firestore config docs.
 *
 * The "Student:" block with {{studentName}}, {{ageYears}}, etc. is never
 * substituted - actual student info is injected into the user message by
 * buildBatchWritingPrompt. These placeholders are dead text the LLM ignores.
 *
 * Usage:
 *   node scripts/ops/clean-writing-analysis-placeholders.mjs          # dry-run
 *   node scripts/ops/clean-writing-analysis-placeholders.mjs --yes    # apply
 */
import admin from "firebase-admin";
import { parseArgs } from "node:util";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const { values: flags } = parseArgs({
  options: { yes: { type: "boolean", default: false } },
  strict: true,
});
const dryRun = !flags.yes;

// Regex: match the Student block from "\nStudent:\n" through the priorAnalysis line.
// Captures the trailing newline so the result has no double-blank left behind.
const STUDENT_BLOCK_RE =
  /\nStudent:\n(?:- [^\n]*\n){1,}(?=\n|$)/;

const CONFIG_IDS = [
  "writing_analysis_primary",
  "writing_analysis_elementary",
  "writing_analysis_toddler",
  "writing_analysis_adolescent",
];

async function run() {
  console.log(`\n=== Clean Writing Analysis Placeholders ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --yes to execute)" : "LIVE"}\n`);

  for (const docId of CONFIG_IDS) {
    const ref = db.collection("config").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`[SKIP] config/${docId} - doc not found`);
      continue;
    }

    const { systemPrompt } = snap.data();
    if (!systemPrompt) {
      console.log(`[SKIP] config/${docId} - no systemPrompt field`);
      continue;
    }

    const match = systemPrompt.match(STUDENT_BLOCK_RE);
    if (!match) {
      console.log(`[SKIP] config/${docId} - no placeholder block found`);
      continue;
    }

    console.log(`[${dryRun ? "WOULD UPDATE" : "UPDATING"}] config/${docId}`);
    console.log(`  Removing block:${match[0].replace(/^/gm, "    ")}`);

    if (!dryRun) {
      const cleaned = systemPrompt.replace(STUDENT_BLOCK_RE, "");
      await ref.update({
        systemPrompt: cleaned,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  Done.\n`);
    } else {
      console.log();
    }
  }

  console.log(dryRun ? "Dry run complete. Pass --yes to apply.\n" : "All updates applied.\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Step 3: Verify that writing_analysis docs have been regenerated after batch CF run.
 *
 * Run this AFTER triggering the batch writing analysis CF (either via the Monday
 * cron or by calling batchAnalyzeWriting per student). This script checks that
 * fresh writing_analysis docs exist for all eligible students.
 *
 * Usage:
 *   node scripts/admin/reset-writing-analysis-step3-verify-regen.mjs
 */

import admin from "firebase-admin";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const serviceAccount = require(
  path.resolve(__dirname, "../../firebase-service-account.json")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pep-os.firebaseio.com",
});

const db = admin.firestore();

// All 28 students with 3+ handwritten media
const ELIGIBLE_STUDENTS = [
  "2025-GUL-030", "2025-GUL-002", "2025-GUL-028", "2025-PLU-002",
  "2025-GUL-004", "2025-GUL-001", "2026-PER-003", "2025-PER-013",
  "2025-PLU-019", "2025-GUL-009", "2025-GUL-025", "2025-GUL-019",
  "2025-PER-003", "2025-GUL-021", "2025-GUL-015", "2025-PER-015",
  "2025-GUL-016", "2025-GUL-010", "2025-GUL-012", "2026-ADO-014",
  "2025-GUL-029", "2025-PLU-008", "2025-PLU-014", "2025-POW-019",
  "2025-PLU-013", "2025-GUL-011", "2025-GUL-018", "2025-PLU-005",
];

async function main() {
  console.log(`\nStep 3 VERIFY: Check writing_analysis regeneration\n`);

  const results = { fresh: [], missing: [], stale: [] };

  for (const studentId of ELIGIBLE_STUDENTS) {
    const docRef = db.doc(`students/${studentId}/ai_summaries/writing_analysis`);
    const snap = await docRef.get();

    if (!snap.exists) {
      results.missing.push(studentId);
      console.log(`  MISSING  ${studentId} — no writing_analysis doc`);
      continue;
    }

    const data = snap.data();
    const generatedAt = data.generatedAt?.toDate?.()
      ? data.generatedAt.toDate()
      : new Date(data.generatedAt);
    const now = new Date();
    const ageHours = (now - generatedAt) / (1000 * 60 * 60);

    // Consider docs generated in the last 48 hours as "fresh"
    if (ageHours <= 48) {
      results.fresh.push(studentId);
      console.log(`  FRESH    ${studentId} — generated ${generatedAt.toISOString().slice(0, 16)}, ${data.sampleCount} samples`);
    } else {
      results.stale.push(studentId);
      console.log(`  STALE    ${studentId} — generated ${generatedAt.toISOString().slice(0, 16)} (${Math.round(ageHours)}h ago)`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Fresh (regenerated): ${results.fresh.length}`);
  console.log(`Missing (no doc):    ${results.missing.length}`);
  console.log(`Stale (old doc):     ${results.stale.length}`);
  console.log(`Total:               ${ELIGIBLE_STUDENTS.length}`);

  if (results.missing.length === 0 && results.stale.length === 0) {
    console.log("\nPASS: All 28 students have fresh writing_analysis docs.");
  } else {
    if (results.missing.length > 0) {
      console.log(`\nMissing students (may lack 3+ handwritten samples after VLM reclassification):`);
      results.missing.forEach((id) => console.log(`  - ${id}`));
    }
    if (results.stale.length > 0) {
      console.log(`\nStale students (old doc not replaced — batch CF may have skipped them):`);
      results.stale.forEach((id) => console.log(`  - ${id}`));
    }
    process.exit(1);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

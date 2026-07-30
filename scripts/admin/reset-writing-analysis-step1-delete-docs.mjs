/**
 * Step 1: Delete existing writing_analysis docs for students who already have them.
 *
 * This removes stale writing_analysis docs so the batch CF creates fresh ones
 * with the latest prompt instead of archiving over old ones.
 *
 * Usage:
 *   node scripts/admin/reset-writing-analysis-step1-delete-docs.mjs [--dry-run]
 *   node scripts/admin/reset-writing-analysis-step1-delete-docs.mjs --verify
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
const dryRun = process.argv.includes("--dry-run");
const verify = process.argv.includes("--verify");

// All 28 students with 3+ handwritten media (eligible for writing analysis)
const ELIGIBLE_STUDENTS = [
  "2025-GUL-030", "2025-GUL-002", "2025-GUL-028", "2025-PLU-002",
  "2025-GUL-004", "2025-GUL-001", "2026-PER-003", "2025-PER-013",
  "2025-PLU-019", "2025-GUL-009", "2025-GUL-025", "2025-GUL-019",
  "2025-PER-003", "2025-GUL-021", "2025-GUL-015", "2025-PER-015",
  "2025-GUL-016", "2025-GUL-010", "2025-GUL-012", "2026-ADO-014",
  "2025-GUL-029", "2025-PLU-008", "2025-PLU-014", "2025-POW-019",
  "2025-PLU-013", "2025-GUL-011", "2025-GUL-018", "2025-PLU-005",
];

async function runDelete() {
  console.log(`\nStep 1: Delete writing_analysis docs`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Students to check: ${ELIGIBLE_STUDENTS.length}\n`);

  let deleted = 0;
  let skipped = 0;

  for (const studentId of ELIGIBLE_STUDENTS) {
    const docRef = db.doc(`students/${studentId}/ai_summaries/writing_analysis`);
    const snap = await docRef.get();

    if (!snap.exists) {
      console.log(`  SKIP  ${studentId} — no writing_analysis doc`);
      skipped++;
      continue;
    }

    const data = snap.data();
    const generatedAt = data.generatedAt?.toDate?.()
      ? data.generatedAt.toDate().toISOString().slice(0, 10)
      : data.generatedAt || "unknown";

    if (dryRun) {
      console.log(`  WOULD DELETE  ${studentId} — generated ${generatedAt}, ${data.sampleCount} samples`);
    } else {
      await docRef.delete();
      console.log(`  DELETED  ${studentId} — was generated ${generatedAt}, ${data.sampleCount} samples`);
    }
    deleted++;
  }

  console.log(`\nDone. ${deleted} ${dryRun ? "would be deleted" : "deleted"}, ${skipped} skipped (no doc).`);
}

async function runVerify() {
  console.log(`\nStep 1 VERIFY: Checking writing_analysis docs are gone\n`);

  let clean = 0;
  let remaining = 0;

  for (const studentId of ELIGIBLE_STUDENTS) {
    const docRef = db.doc(`students/${studentId}/ai_summaries/writing_analysis`);
    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data();
      console.log(`  STILL EXISTS  ${studentId} — generated ${data.generatedAt}`);
      remaining++;
    } else {
      clean++;
    }
  }

  console.log(`\nResult: ${clean} clean, ${remaining} still exist.`);

  if (remaining === 0) {
    console.log("PASS: All writing_analysis docs deleted successfully.");
  } else {
    console.log("FAIL: Some docs remain. Re-run step 1 without --dry-run.");
    process.exit(1);
  }
}

(verify ? runVerify() : runDelete())
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

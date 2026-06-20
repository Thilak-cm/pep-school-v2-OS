/**
 * Backfill reportType field on existing ai_summaries report docs (PEP-325).
 *
 * All existing reports predate the monthly baseline feature, so they are
 * all term reports.  This script sets `reportType: 'term'` on every
 * students/{studentId}/ai_summaries/report_* doc that lacks the field.
 *
 * Usage:
 *   node scripts/admin/backfill-report-type.mjs          # dry run
 *   node scripts/admin/backfill-report-type.mjs --apply  # apply changes
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const dryRun = !process.argv.includes("--apply");

if (dryRun) {
  console.log("=== DRY RUN (pass --apply to execute) ===\n");
}

const studentsSnap = await db.collection("students").get();
console.log(`Found ${studentsSnap.size} students.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let batch = db.batch();
let batchCount = 0;
const BATCH_LIMIT = 400; // Firestore batch limit is 500; leave headroom

for (const studentDoc of studentsSnap.docs) {
  const studentId = studentDoc.id;
  const summariesSnap = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .get();

  for (const doc of summariesSnap.docs) {
    // Only process report docs (report_XXXXXXXX pattern)
    if (!doc.id.startsWith("report_")) continue;

    const data = doc.data();
    if (data.reportType) {
      totalSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [would set] students/${studentId}/ai_summaries/${doc.id} → reportType: 'term'`);
    } else {
      batch.update(doc.ref, { reportType: "term" });
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`  Committed batch of ${batchCount} updates.`);
        batch = db.batch();
        batchCount = 0;
      }
    }
    totalUpdated++;
  }
}

// Commit remaining batch
if (!dryRun && batchCount > 0) {
  await batch.commit();
  console.log(`  Committed final batch of ${batchCount} updates.`);
}

console.log(`\nDone. Updated: ${totalUpdated}, Skipped (already set): ${totalSkipped}.`);
if (dryRun && totalUpdated > 0) {
  console.log("Re-run with --apply to persist changes.");
}

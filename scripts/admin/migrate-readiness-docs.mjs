/**
 * Migrate report_readiness → term_report_readiness (#152).
 *
 * The readiness doc was previously a singleton at:
 *   students/{studentId}/ai_summaries/report_readiness
 *
 * Now each report type has its own doc:
 *   students/{studentId}/ai_summaries/term_report_readiness
 *   students/{studentId}/ai_summaries/baseline_report_readiness
 *
 * This script copies report_readiness → term_report_readiness and
 * deletes the old doc (all existing readiness docs are for term reports).
 *
 * Usage:
 *   node scripts/admin/migrate-readiness-docs.mjs          # dry run
 *   node scripts/admin/migrate-readiness-docs.mjs --apply  # apply changes
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

let migrated = 0;
let skipped = 0;
let alreadyMigrated = 0;

for (const studentDoc of studentsSnap.docs) {
  const studentId = studentDoc.id;
  const oldRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("report_readiness");
  const newRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("term_report_readiness");

  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) {
    skipped++;
    continue;
  }

  const newSnap = await newRef.get();
  if (newSnap.exists) {
    alreadyMigrated++;
    continue;
  }

  const data = oldSnap.data();

  if (dryRun) {
    console.log(`  [DRY] ${studentId}: would copy report_readiness → term_report_readiness`);
  } else {
    const batch = db.batch();
    batch.set(newRef, data);
    batch.delete(oldRef);

    // Also migrate history subcollection if it exists
    const historySnap = await oldRef.collection("history").get();
    if (!historySnap.empty) {
      for (const historyDoc of historySnap.docs) {
        const newHistoryRef = newRef.collection("history").doc(historyDoc.id);
        batch.set(newHistoryRef, historyDoc.data());
        batch.delete(historyDoc.ref);
      }
      console.log(`  ${studentId}: migrated readiness doc + ${historySnap.size} history entries`);
    } else {
      console.log(`  ${studentId}: migrated readiness doc`);
    }

    await batch.commit();
  }
  migrated++;
}

console.log(`\nDone. Migrated: ${migrated}, Skipped (no doc): ${skipped}, Already migrated: ${alreadyMigrated}`);
if (dryRun) {
  console.log("\nRe-run with --apply to execute.");
}

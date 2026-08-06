/**
 * Restore an archived monthly plan for a single student.
 *
 * 1. Reads the archived July plan from history subcollection
 * 2. Overwrites the current monthly_plan doc (August) with the archived July plan
 * 3. Deletes the archive entry
 *
 * Usage:
 *   node scripts/admin/restore-archived-plan.mjs                  # dry run
 *   node scripts/admin/restore-archived-plan.mjs --apply          # execute
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const RESTORES = [
  { studentId: "2026-LIL-002", archiveDocId: "2026-07_2026-07-03T18-19-35-373Z" },
  { studentId: "2026-ACC-005", archiveDocId: "2026-07_2026-07-03T18-19-50-623Z" },
  { studentId: "2026-LIL-001", archiveDocId: "2026-07_2026-07-03T18-20-04-554Z" },
];
const apply = process.argv.includes("--apply");

async function main() {
  for (const { studentId, archiveDocId } of RESTORES) {
    console.log(`\n--- ${studentId} ---`);
    const planDocRef = db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("monthly_plan");
    const archiveDocRef = planDocRef.collection("history").doc(archiveDocId);

    // 1. Read archive
    const archiveSnap = await archiveDocRef.get();
    if (!archiveSnap.exists) {
      console.error(`  Archive doc not found: ${archiveDocId} — skipping`);
      continue;
    }
    const archivedPlan = archiveSnap.data();
    console.log(`  Archived plan: month=${archivedPlan.month}, generatedAt=${archivedPlan.generatedAt}`);

    // 2. Read current plan
    const currentSnap = await planDocRef.get();
    if (currentSnap.exists) {
      const current = currentSnap.data();
      console.log(`  Current plan: month=${current.month}, generatedAt=${current.generatedAt}`);
    } else {
      console.log("  No current plan doc (will create)");
    }

    // 3. Strip archive metadata before restoring
    const { archivedAt, archivedReason, ...restoredPlan } = archivedPlan;
    console.log(`  Will restore: month=${restoredPlan.month} (${restoredPlan.studentName})`);

    if (!apply) continue;

    // 4. Overwrite current plan with archived July plan + delete archive entry
    const batch = db.batch();
    batch.set(planDocRef, restoredPlan);
    batch.delete(archiveDocRef);
    await batch.commit();

    console.log("  ✓ Restored + archive entry deleted");
  }

  if (!apply) {
    console.log("\n[DRY RUN] No changes made. Re-run with --apply to execute.");
  } else {
    console.log("\n✓ All done");
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

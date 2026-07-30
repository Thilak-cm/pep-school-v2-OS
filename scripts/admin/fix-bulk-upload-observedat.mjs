/**
 * One-off script to update observedAt on Rahul's July 3 bulk upload notes.
 *
 * These 16 docs in allstars classroom were bulk-uploaded on 2026-07-03 but
 * their observedAt was set to 2026-06-27 IST (the CSV date). Rahul wants
 * them moved to 2026-07-03.
 *
 * Usage:
 *   node scripts/admin/fix-bulk-upload-observedat.mjs          # dry run
 *   node scripts/admin/fix-bulk-upload-observedat.mjs --apply  # apply changes
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "pep-os" });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes("--apply");
const NEW_OBSERVED_AT = admin.firestore.Timestamp.fromDate(
  new Date("2026-07-03T00:00:00+05:30")
);

// All 16 bulk docs uploaded by Rahul on July 3
const DOCS = [
  { studentId: "2025-ADO-029", obsId: "obs_bulk_mr4ui882_dg9tgf" },
  { studentId: "2025-ADO-029", obsId: "obs_bulk_mr4uftx2_mvwcp7" },
  { studentId: "2025-ADO-028", obsId: "obs_bulk_mr4ui881_bf3ec2" },
  { studentId: "2025-ADO-028", obsId: "obs_bulk_mr4uftx2_calf3q" },
  { studentId: "2025-ADO-027", obsId: "obs_bulk_mr4ui882_ggpyjj" },
  { studentId: "2025-ADO-027", obsId: "obs_bulk_mr4uftx2_1kaeqt" },
  { studentId: "2025-ADO-019", obsId: "obs_bulk_mr4ui882_fiebq1" },
  { studentId: "2025-ADO-019", obsId: "obs_bulk_mr4uftx3_i3bxof" },
  { studentId: "2025-ADO-018", obsId: "obs_bulk_mr4ui882_1kpuhv" },
  { studentId: "2025-ADO-018", obsId: "obs_bulk_mr4uftx3_eh110c" },
  { studentId: "2025-ADO-010", obsId: "obs_bulk_mr4uftx3_3t0rzi" },
  { studentId: "2025-ADO-006", obsId: "obs_bulk_mr4ui882_9ggrjj" },
  { studentId: "2025-ADO-006", obsId: "obs_bulk_mr4uftx3_42drwh" },
  { studentId: "2025-ADO-004", obsId: "obs_bulk_mr4uftx1_bo8k2m" },
  { studentId: "2025-ADO-002", obsId: "obs_bulk_mr4ui882_g1u9nt" },
  { studentId: "2025-ADO-002", obsId: "obs_bulk_mr4uftx3_q94r65" },
];

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");
  console.log(`Updating ${DOCS.length} docs to observedAt = ${NEW_OBSERVED_AT.toDate().toISOString()}\n`);

  const batch = db.batch();
  let found = 0;

  for (const { studentId, obsId } of DOCS) {
    const ref = db.doc(`students/${studentId}/observations/${obsId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  MISSING: ${ref.path}`);
      continue;
    }
    const current = snap.data().observedAt?.toDate?.()?.toISOString() || "unknown";
    console.log(`  ${ref.path}  ${current} -> ${NEW_OBSERVED_AT.toDate().toISOString()}`);
    batch.update(ref, {
      observedAt: NEW_OBSERVED_AT,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    found++;
  }

  console.log(`\nFound ${found}/${DOCS.length} docs.`);

  if (!DRY_RUN && found > 0) {
    await batch.commit();
    console.log("Batch committed.");
  } else if (DRY_RUN) {
    console.log("Dry run - no changes made. Run with --apply to commit.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

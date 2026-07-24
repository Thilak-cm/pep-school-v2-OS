/**
 * Migrate media subcollection into observations (#221).
 *
 * For every student, copies each doc from students/{id}/media/{docId}
 * into students/{id}/observations/{docId} with all fields preserved.
 * Media docs already have type: 'media', observedAt, classroomId, etc.
 * so no field transformation is needed - it's a pure copy.
 *
 * Storage paths are NOT changed - media[].storagePath still points to
 * students/{id}/media/{docId}/original.webp. Storage rules are updated
 * separately to read the Firestore doc from the new location.
 *
 * Two modes:
 *   node scripts/ops/migrate-media-to-observations.mjs          # dry-run (default)
 *   node scripts/ops/migrate-media-to-observations.mjs --yes    # execute
 *
 * Does NOT delete source media docs (kept for rollback safety).
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
const BATCH_LIMIT = 450; // Firestore batch limit is 500, leave headroom

const { values: flags } = parseArgs({
  options: {
    yes: { type: "boolean", default: false },
  },
  strict: true,
});

const dryRun = !flags.yes;

async function run() {
  console.log(`\n=== Media -> Observations Migration ===`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --yes to execute)" : "LIVE"}\n`);

  // Fetch all students
  const studentsSnap = await db.collection("students").get();
  console.log(`Found ${studentsSnap.size} student docs\n`);

  let totalMediaDocs = 0;
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const studentDoc of studentsSnap.docs) {
    const studentId = studentDoc.id;
    const mediaSnap = await db
      .collection("students")
      .doc(studentId)
      .collection("media")
      .get();

    if (mediaSnap.empty) continue;

    totalMediaDocs += mediaSnap.size;
    console.log(`  ${studentId}: ${mediaSnap.size} media doc(s)`);

    if (dryRun) {
      totalCopied += mediaSnap.size;
      continue;
    }

    // Batch write media docs into observations
    let batch = db.batch();
    let batchCount = 0;

    for (const mediaDoc of mediaSnap.docs) {
      const destRef = db
        .collection("students")
        .doc(studentId)
        .collection("observations")
        .doc(mediaDoc.id);

      // Check if already migrated (idempotent)
      const existing = await destRef.get();
      if (existing.exists) {
        totalSkipped++;
        continue;
      }

      batch.set(destRef, mediaDoc.data());
      batchCount++;
      totalCopied++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`    committed batch of ${batchCount}`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      try {
        await batch.commit();
        console.log(`    committed batch of ${batchCount}`);
      } catch (err) {
        console.error(`    ERROR committing batch for ${studentId}: ${err.message}`);
        totalErrors++;
      }
    }
  }

  // Verification: count media-type docs in observations
  if (!dryRun) {
    console.log(`\n--- Verification ---`);
    const obsMediaSnap = await db
      .collectionGroup("observations")
      .where("type", "==", "media")
      .get();
    console.log(`  media docs in observations: ${obsMediaSnap.size}`);
    console.log(`  media docs in source:       ${totalMediaDocs}`);
    if (obsMediaSnap.size >= totalMediaDocs) {
      console.log(`  Status: OK (all media docs present in observations)`);
    } else {
      console.log(`  Status: MISMATCH - some docs may not have been copied`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Total media docs found: ${totalMediaDocs}`);
  console.log(`  ${dryRun ? "Would copy" : "Copied"}:  ${totalCopied}`);
  if (totalSkipped > 0) console.log(`  Skipped (already exist): ${totalSkipped}`);
  if (totalErrors > 0) console.log(`  Errors: ${totalErrors}`);
  console.log(`  Source media docs: NOT deleted (kept for rollback)\n`);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

/**
 * Find pending media observation documents whose Storage objects are missing
 * and mark those confirmed orphaned records as failed.
 *
 * The referenced Storage objects were checked independently and do not exist.
 * Keep these documents for auditability, but make their terminal state explicit
 * so stats reconciliation can safely advance past them.
 *
 * Usage:
 *   node scripts/admin/mark-orphaned-media-failed.mjs          # dry run
 *   node scripts/admin/mark-orphaned-media-failed.mjs --apply # write changes
 */
import admin from "firebase-admin";

admin.initializeApp({projectId: "pep-os", storageBucket: "pep-os.firebasestorage.app"});
const db = admin.firestore();
const bucket = admin.storage().bucket();
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");
  console.log("Scanning all media observations and checking referenced Storage objects.\n");

  const BATCH_LIMIT = 450; // Firestore batch limit is 500; leave headroom
  let eligible = 0;
  let pending = 0;
  let present = 0;

  const mediaSnap = await db.collectionGroup("observations").where("type", "==", "media").get();
  const toUpdate = [];
  for (const snap of mediaSnap.docs) {
    const ref = snap.ref;
    const data = snap.data();
    // Match isPendingMedia: anything not "ready" or "failed" is a barrier,
    // including legacy "uploaded" status or future unknown values.
    if (data.status === "ready" || data.status === "failed") continue;
    pending++;

    const storagePath = data.media?.[0]?.storagePath;
    const [exists] = storagePath ? await bucket.file(storagePath).exists() : [false];
    if (exists) {
      present++;
      continue;
    }

    console.log(`  ${ref.path}  ${data.status} -> failed`);
    toUpdate.push(ref);
    eligible++;
  }

  console.log(`\nPending media: ${pending}`);
  console.log(`Storage objects present: ${present}`);
  console.log(`Orphaned and eligible: ${eligible}`);
  if (dryRun) {
    console.log("Dry run - no changes made. Run with --apply to commit.");
  } else if (toUpdate.length > 0) {
    for (let i = 0; i < toUpdate.length; i += BATCH_LIMIT) {
      const chunk = toUpdate.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const ref of chunk) {
        batch.update(ref, {
          status: "failed",
          errorCode: "orphaned_upload",
          errorMessage: "Referenced Storage object was not found during recovery.",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      console.log(`Batch ${Math.floor(i / BATCH_LIMIT) + 1} committed (${chunk.length} docs).`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

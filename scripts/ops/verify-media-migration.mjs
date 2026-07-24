/**
 * Verify media → observations migration (#221).
 *
 * Compares doc counts between the old media subcollection and
 * media-type docs in the observations subcollection.
 *
 *   node scripts/ops/verify-media-migration.mjs
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

async function run() {
  console.log("\n=== Media Migration Verification ===\n");

  const [sourceSnap, destSnap] = await Promise.all([
    db.collectionGroup("media").get(),
    db.collectionGroup("observations").where("type", "==", "media").get(),
  ]);

  const sourceCount = sourceSnap.size;
  const destCount = destSnap.size;

  console.log(`  Source (media subcollection):       ${sourceCount}`);
  console.log(`  Destination (observations, type=media): ${destCount}`);

  if (destCount >= sourceCount) {
    console.log(`\n  Status: OK - all ${sourceCount} media docs present in observations`);
  } else {
    console.log(`\n  Status: MISMATCH - ${sourceCount - destCount} docs missing`);

    // Find which docs are missing
    const destIds = new Set(destSnap.docs.map((d) => d.id));
    const missing = sourceSnap.docs.filter((d) => !destIds.has(d.id));
    console.log(`\n  Missing doc IDs (first 20):`);
    for (const d of missing.slice(0, 20)) {
      const studentId = d.ref.parent.parent.id;
      console.log(`    ${studentId}/media/${d.id}`);
    }
  }

  // Status breakdown
  const statusCounts = {};
  destSnap.docs.forEach((d) => {
    const st = d.data().status || "unknown";
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  console.log(`\n  Status breakdown in observations:`);
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${status}: ${count}`);
  }

  console.log();
  process.exit(0);
}

run().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});

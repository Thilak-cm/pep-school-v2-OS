/**
 * Comprehensive audit of media observation status distribution.
 *
 * Reports:
 *   - Status breakdown across all media observations (collection-group)
 *   - Age distribution of non-terminal (not ready/failed) documents
 *   - Per-classroom breakdown of blocking statuses
 *   - Storage object existence check for blocking docs
 *
 * Read-only. No writes.
 *
 * Usage:
 *   node scripts/admin/audit-media-status.mjs
 *   node scripts/admin/audit-media-status.mjs --check-storage   # also verify Storage objects
 */
import admin from "firebase-admin";

admin.initializeApp({projectId: "pep-os", storageBucket: "pep-os.firebasestorage.app"});
const db = admin.firestore();
const bucket = admin.storage().bucket();
const checkStorage = process.argv.includes("--check-storage");

function ageLabel(createdAt) {
  if (!createdAt) return "unknown";
  const ms = typeof createdAt.toMillis === "function" ? createdAt.toMillis() : new Date(createdAt).getTime();
  const ageDays = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (ageDays < 1) return "<1d";
  if (ageDays < 7) return "1-7d";
  if (ageDays < 30) return "7-30d";
  if (ageDays < 90) return "30-90d";
  return ">90d";
}

async function main() {
  console.log("Scanning all media observations (collection-group query)...\n");

  const snap = await db.collectionGroup("observations").where("type", "==", "media").get();
  console.log(`Total media observations: ${snap.size}\n`);

  // Status breakdown
  const byStatus = {};
  // Blocking docs details
  const blocking = [];
  // Per-classroom blocking counts
  const byClassroom = {};

  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status || "(missing)";
    byStatus[status] = (byStatus[status] || 0) + 1;

    // Anything not ready or failed is a potential barrier for delta stats
    if (status !== "ready" && status !== "failed") {
      const pathParts = doc.ref.path.split("/");
      // students/{studentId}/observations/{obsId} - extract classroom from data
      const classroomId = data.classroomId || "(unknown)";
      blocking.push({
        path: doc.ref.path,
        status,
        classroomId,
        createdAt: data.createdAt,
        age: ageLabel(data.createdAt),
        storagePath: data.media?.[0]?.storagePath || null,
      });
      byClassroom[classroomId] = (byClassroom[classroomId] || 0) + 1;
    }
  }

  // Print status breakdown
  console.log("=== Status Breakdown ===");
  const sorted = Object.entries(byStatus).sort(([, a], [, b]) => b - a);
  for (const [status, count] of sorted) {
    const pct = ((count / snap.size) * 100).toFixed(2);
    const marker = status !== "ready" && status !== "failed" ? " <-- BLOCKS DELTA" : "";
    console.log(`  ${status}: ${count} (${pct}%)${marker}`);
  }

  if (blocking.length === 0) {
    console.log("\nNo blocking media observations found. Delta stats cursor is unobstructed.");
    process.exit(0);
  }

  // Age distribution of blocking docs
  console.log(`\n=== Blocking Documents: ${blocking.length} ===`);
  const byAge = {};
  for (const doc of blocking) {
    byAge[doc.age] = (byAge[doc.age] || 0) + 1;
  }
  console.log("\nAge distribution:");
  for (const age of ["<1d", "1-7d", "7-30d", "30-90d", ">90d", "unknown"]) {
    if (byAge[age]) console.log(`  ${age}: ${byAge[age]}`);
  }

  // Per-classroom breakdown
  console.log("\nPer-classroom:");
  const classroomSorted = Object.entries(byClassroom).sort(([, a], [, b]) => b - a);
  for (const [classroom, count] of classroomSorted) {
    console.log(`  ${classroom}: ${count}`);
  }

  // List individual blocking docs
  console.log("\nIndividual blocking documents:");
  for (const doc of blocking) {
    console.log(`  ${doc.path}`);
    console.log(`    status: ${doc.status}, age: ${doc.age}, classroom: ${doc.classroomId}`);
    if (doc.storagePath) console.log(`    storagePath: ${doc.storagePath}`);
  }

  // Optional Storage check
  if (checkStorage && blocking.length > 0) {
    console.log("\n=== Storage Object Check ===");
    let found = 0;
    let missing = 0;
    let noPath = 0;
    for (const doc of blocking) {
      if (!doc.storagePath) {
        noPath++;
        console.log(`  ${doc.path}: no storagePath`);
        continue;
      }
      const [exists] = await bucket.file(doc.storagePath).exists();
      if (exists) {
        found++;
        console.log(`  ${doc.path}: PRESENT in Storage`);
      } else {
        missing++;
        console.log(`  ${doc.path}: MISSING from Storage (orphaned)`);
      }
    }
    console.log(`\nStorage summary: ${found} present, ${missing} missing, ${noPath} no path`);
  }

  console.log("\n=== Recommendation ===");
  const recent = blocking.filter((d) => d.age === "<1d" || d.age === "1-7d");
  const old = blocking.filter((d) => d.age !== "<1d" && d.age !== "1-7d");
  if (recent.length > 0) {
    console.log(`${recent.length} blocking doc(s) are <7 days old - may be legitimate in-progress uploads.`);
  }
  if (old.length > 0) {
    console.log(`${old.length} blocking doc(s) are >7 days old - likely orphaned. Consider mark-orphaned-media-failed.mjs.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

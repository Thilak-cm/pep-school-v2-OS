#!/usr/bin/env node
/**
 * One-time cleanup: remove orphaned teacherIds from classroom docs.
 *
 * These UIDs have no user doc in Firestore, zero observations, and were
 * left behind by hard-deletes that predated the PEP-250 soft-delete cascade.
 *
 * Usage: node scripts/admin/cleanup-orphan-teacherids.mjs [--dry-run]
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pep-os",
});

const db = getFirestore();

const ORPHANS = [
  // No user doc — deleted user, UID left in classroom
  { uid: "Fp98fM07jRfscuwQzF9hSwztxVz1", classroom: "parijat", reason: "no user doc" },
  // No user doc — malformed 20-char UIDs (legacy/corrupted)
  { uid: "6P0CnaMn0GI7FBtyp2Tg", classroom: "periwinkle", reason: "no user doc, malformed UID" },
  { uid: "cGVR7TdRc5WrAi50SXxm", classroom: "periwinkle", reason: "no user doc, malformed UID" },
  // Stale pending — real account AYpFKsO8jFWO4aiYQZ0LzCLIjZg1 already active in allstars
  { uid: "pending_teja_sudha_pepschoolv2_com", classroom: "allstars", reason: "stale pending, real account exists" },
];

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(`\n${dryRun ? "[DRY RUN]" : "[LIVE]"} Cleaning up ${ORPHANS.length} orphaned teacherIds\n`);

  for (const { uid, classroom, reason } of ORPHANS) {
    const ref = db.collection("classrooms").doc(classroom);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  SKIP ${classroom} — doc not found`);
      continue;
    }

    const teacherIds = snap.data().teacherIds || [];
    if (!teacherIds.includes(uid)) {
      console.log(`  SKIP ${classroom} — ${uid} not in teacherIds (already cleaned?)`);
      continue;
    }

    console.log(`  ${dryRun ? "WOULD REMOVE" : "REMOVING"} ${uid} from ${classroom} (${reason})`);

    if (!dryRun) {
      await ref.update({
        teacherIds: FieldValue.arrayRemove(uid),
        teacherCount: teacherIds.length - 1,
      });
      console.log(`    ✓ Done — teacherIds: ${teacherIds.length} → ${teacherIds.length - 1}`);
    }
  }

  // Also clean up the stale pending user doc for Teja Sudha
  const pendingTejaRef = db.collection("users").doc("pending_teja_sudha_pepschoolv2_com");
  const pendingTejaSnap = await pendingTejaRef.get();
  if (pendingTejaSnap.exists) {
    console.log(`\n  ${dryRun ? "WOULD DELETE" : "DELETING"} stale pending user doc: pending_teja_sudha_pepschoolv2_com`);
    if (!dryRun) {
      await pendingTejaRef.delete();
      console.log("    ✓ Done");
    }
  }

  console.log("\nCleanup complete.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

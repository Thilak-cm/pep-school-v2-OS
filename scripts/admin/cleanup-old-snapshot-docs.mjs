/**
 * Cleanup script: Delete deprecated baseball_card + signals docs.
 *
 * Run ONLY after:
 * 1. migrate-weekly-snapshot.mjs has been run successfully
 * 2. New Cloud Functions + frontend code deployed and verified
 *
 * Deletes `ai_summaries/baseball_card` and `ai_summaries/signals` for all students.
 *
 * Usage: node scripts/admin/cleanup-old-snapshot-docs.mjs [--dry-run]
 *
 * PEP-229
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

async function main() {
  console.log(`\n🧹 Cleaning up deprecated baseball_card + signals docs${dryRun ? " (DRY RUN)" : ""}\n`);

  // Safety check: verify weekly_snapshot exists for at least one student
  const sampleStudents = await db.collection("students").limit(5).get();
  let hasWeeklySnapshot = false;
  for (const s of sampleStudents.docs) {
    const wsSnap = await db.collection("students").doc(s.id).collection("ai_summaries").doc("weekly_snapshot").get();
    if (wsSnap.exists) {
      hasWeeklySnapshot = true;
      break;
    }
  }

  if (!hasWeeklySnapshot) {
    console.error("❌ No weekly_snapshot docs found. Run migrate-weekly-snapshot.mjs first.");
    process.exit(1);
  }

  const studentsSnap = await db.collection("students").get();
  const studentIds = studentsSnap.docs.map((d) => d.id);
  console.log(`Found ${studentIds.length} students\n`);

  let deletedCard = 0;
  let deletedSignals = 0;

  const BATCH_SIZE = 250;
  for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
    const chunk = studentIds.slice(i, i + BATCH_SIZE);
    const batch = dryRun ? null : db.batch();

    for (const studentId of chunk) {
      const aiRef = db.collection("students").doc(studentId).collection("ai_summaries");

      const [cardSnap, signalsSnap] = await Promise.all([
        aiRef.doc("baseball_card").get(),
        aiRef.doc("signals").get(),
      ]);

      if (cardSnap.exists) {
        if (dryRun) {
          console.log(`  [DRY] Delete ${studentId}/ai_summaries/baseball_card`);
        } else {
          batch.delete(cardSnap.ref);
        }
        deletedCard++;
      }

      if (signalsSnap.exists) {
        if (dryRun) {
          console.log(`  [DRY] Delete ${studentId}/ai_summaries/signals`);
        } else {
          batch.delete(signalsSnap.ref);
        }
        deletedSignals++;
      }
    }

    if (!dryRun && batch) {
      await batch.commit();
      console.log(`  Committed cleanup batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   Deleted baseball_card docs: ${deletedCard}`);
  console.log(`   Deleted signals docs: ${deletedSignals}`);

  if (dryRun) {
    console.log(`\n   Re-run without --dry-run to apply deletions.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});

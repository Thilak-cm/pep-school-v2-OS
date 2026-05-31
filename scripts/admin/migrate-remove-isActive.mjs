/**
 * migrate-remove-isActive.mjs
 *
 * Removes the deprecated `isActive` field from all student docs.
 * The `status` field is now the canonical source of truth.
 *
 * Usage:
 *   node scripts/admin/migrate-remove-isActive.mjs           # dry run
 *   node scripts/admin/migrate-remove-isActive.mjs --commit   # apply changes
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
const dryRun = !process.argv.includes("--commit");

async function main() {
  if (dryRun) {
    console.log("DRY RUN — pass --commit to apply changes\n");
  }

  const snap = await db.collection("students").get();
  let withField = 0;
  let missingStatus = 0;

  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.isActive === "undefined") continue;

    withField++;
    const updates = {
      isActive: admin.firestore.FieldValue.delete(),
    };

    // Safety: if a doc has isActive but no status, backfill status first
    if (!data.status) {
      updates.status = data.isActive ? "active" : "inactive";
      missingStatus++;
      console.log(
        `  ${doc.id}: isActive=${data.isActive}, no status → setting status="${updates.status}"`
      );
    } else {
      console.log(`  ${doc.id}: removing isActive (status="${data.status}")`);
    }

    if (!dryRun) {
      batch.update(doc.ref, updates);
      batchCount++;

      // Firestore batches max 500 writes
      if (batchCount >= 490) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }

  console.log(`\nTotal student docs: ${snap.size}`);
  console.log(`Docs with isActive field: ${withField}`);
  console.log(`Docs missing status (backfilled): ${missingStatus}`);
  console.log(dryRun ? "\nDry run complete. Pass --commit to apply." : "\nMigration complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

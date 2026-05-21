/**
 * Migration script: Convert guardian fields to parent1 fields on student docs.
 *
 * Known data: only `2026-ACC-006` has guardian fields (guardianName: "Srikanth Reddy",
 * guardianPhone: "9701431740"). No email on file.
 *
 * For each student with guardianName set:
 *   1. Copy guardianName   -> parent1Name
 *   2. Copy guardianPhone  -> parent1Phone
 *   3. Delete guardianName, guardianRelationship, guardianPhone
 *
 * Usage: node scripts/admin/migrate-guardian-to-parent.mjs [--dry-run]
 *
 * PEP-247
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
  console.log(`\nMigrate guardian -> parent1 fields (PEP-247)`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // Find all students with guardianName set
  const snapshot = await db
    .collection("students")
    .where("guardianName", "!=", "")
    .get();

  console.log(`Found ${snapshot.size} student(s) with guardian data.\n`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(
      `  ${doc.id}: guardianName="${data.guardianName}", ` +
        `guardianPhone="${data.guardianPhone || ""}", ` +
        `guardianRelationship="${data.guardianRelationship || ""}"`
    );

    if (!dryRun) {
      await doc.ref.update({
        parent1Name: data.guardianName || "",
        ...(data.guardianPhone ? { parent1Phone: data.guardianPhone } : {}),
        // No parent1Email — none on file for this student
        guardianName: admin.firestore.FieldValue.delete(),
        guardianRelationship: admin.firestore.FieldValue.delete(),
        guardianPhone: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`    -> Migrated to parent1Name/parent1Phone, removed guardian fields.`);
    } else {
      console.log(`    -> [DRY RUN] Would migrate to parent1Name/parent1Phone.`);
    }
  }

  if (snapshot.size === 0) {
    console.log("  No students with guardian data found. Nothing to migrate.");
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

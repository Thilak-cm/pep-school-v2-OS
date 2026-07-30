/**
 * Clear stale Drive export references from all monthly plan Firestore docs.
 *
 * Removes driveDocId, driveDocLink, driveChecklistId, driveChecklistLink,
 * driveExportedAt, driveExportedBy from students/{id}/ai_summaries/monthly_plan.
 *
 * Usage:
 *   node scripts/admin/clear-drive-refs.mjs [--dry-run]
 */

import admin from "firebase-admin";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
const { FieldValue } = admin.firestore;

const FIELDS_TO_CLEAR = [
  "driveDocId",
  "driveDocLink",
  "driveChecklistId",
  "driveChecklistLink",
  "driveExportedAt",
  "driveExportedBy",
];

async function main() {
  console.log(`Clear stale Drive references from monthly plan docs`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const studentsSnap = await db.collection("students").get();
  let cleared = 0;
  let skipped = 0;

  for (const studentDoc of studentsSnap.docs) {
    const planRef = db.doc(`students/${studentDoc.id}/ai_summaries/monthly_plan`);
    const planSnap = await planRef.get();

    if (!planSnap.exists) { skipped++; continue; }

    const data = planSnap.data();
    if (!data.driveDocLink) { skipped++; continue; }

    const name = data.studentName || studentDoc.id;
    console.log(`  ${studentDoc.id}  ${name}  — clearing Drive refs`);

    if (!dryRun) {
      const update = {};
      for (const field of FIELDS_TO_CLEAR) {
        update[field] = FieldValue.delete();
      }
      await planRef.update(update);
    }
    cleared++;
  }

  console.log(`\nCleared: ${cleared}`);
  console.log(`Skipped: ${skipped} (no plan or no Drive refs)`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

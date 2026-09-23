/**
 * Backfill #290 denormalized fields onto structured assessment records.
 *
 * publishStructuredAssessment now writes `sourceFileName` and `studentCount`
 * onto every fan-out observation record so timelines can render
 * "{teacher} added structured assessment {file} for {N} students" without a
 * Cloud Function round-trip per entry. Records published before #290 lack
 * both fields; this script copies them from each source manifest.
 *
 * Safe to re-run: records that already carry both fields are skipped.
 * Fields are immutable post-publish (no edit capability exists), so a single
 * pass per source is complete.
 *
 * Dry-run by default. Requires --yes to apply writes.
 *
 * Usage:
 *   node scripts/ops/backfill-assessment-denorm.mjs           # dry-run
 *   node scripts/ops/backfill-assessment-denorm.mjs --yes     # apply
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../../functions/package.json"));
const serviceAccount = require(path.resolve(__dirname, "../../firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const shouldApply = process.argv.includes("--yes");
const dryRun = !shouldApply;

async function main() {
  console.log(dryRun
    ? "DRY-RUN: no writes will be applied. Re-run with --yes to apply."
    : "APPLY MODE: writes will be committed.");

  const sourcesSnap = await db.collection("structuredAssessmentSources").get();
  console.log(`Sources found: ${sourcesSnap.size}`);

  let recordsChecked = 0;
  let recordsToUpdate = 0;
  let recordsUpdated = 0;

  for (const sourceDoc of sourcesSnap.docs) {
    const source = sourceDoc.data();
    const sourceId = sourceDoc.id;
    const sourceFileName = source.sourceFileName || "";
    const studentCount = source.studentCount || 0;
    if (!sourceFileName && !studentCount) {
      console.warn(`  [skip] ${sourceId}: manifest has no sourceFileName/studentCount`);
      continue;
    }

    const recordsSnap = await db.collectionGroup("observations")
      .where("sourceId", "==", sourceId)
      .get();
    recordsChecked += recordsSnap.size;

    const stale = recordsSnap.docs.filter((recordDoc) => {
      const record = recordDoc.data();
      return record.sourceFileName !== sourceFileName ||
        record.studentCount !== studentCount;
    });
    if (!stale.length) continue;
    recordsToUpdate += stale.length;

    console.log(`  ${sourceId} ("${source.assessmentName || "?"}"): ${stale.length}/${recordsSnap.size} records need {sourceFileName, studentCount}`);
    for (const recordDoc of stale) {
      console.log(`    - ${recordDoc.ref.path}`);
    }

    if (!dryRun) {
      // Batched in chunks below Firestore's 500-write limit.
      const chunks = [];
      for (let i = 0; i < stale.length; i += 400) {
        chunks.push(stale.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((recordDoc) => {
          batch.update(recordDoc.ref, { sourceFileName, studentCount });
        });
        await batch.commit();
        recordsUpdated += chunk.length;
      }
    }
  }

  console.log("---");
  console.log(`Records checked: ${recordsChecked}`);
  console.log(`Records needing backfill: ${recordsToUpdate}`);
  console.log(dryRun
    ? "Dry-run complete. No writes applied."
    : `Records updated: ${recordsUpdated}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

/**
 * Remove structured assessment observations whose source manifest is missing.
 *
 * This repairs the legacy cascade-delete bug where the source was removed but
 * fan-out student observations survived. The script intentionally does not
 * touch medical assessments or structured records with a valid source.
 *
 * Usage:
 *   node scripts/admin/cleanup-orphaned-assessment-records.mjs
 *   node scripts/admin/cleanup-orphaned-assessment-records.mjs --source-id=SOURCE_ID
 *   node scripts/admin/cleanup-orphaned-assessment-records.mjs --yes
 */

import {applicationDefault, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pep-os",
});

const db = getFirestore();
const APPLY = process.argv.includes("--yes");
const sourceFilter = process.argv.find((arg) => arg.startsWith("--source-id="))
  ?.slice("--source-id=".length) || null;

async function findOrphans() {
  // Avoid requiring a production collection-group index for this one-time
  // repair. The result set is filtered locally before any mutation is queued.
  const snapshot = await db.collectionGroup("observations").get();
  const records = snapshot.docs.filter((record) => {
    const data = record.data() || {};
    const sourceId = data.sourceId;
    if (data.assessmentKind !== "structured") return false;
    return sourceId && (!sourceFilter || sourceId === sourceFilter);
  });
  const sourceIds = [...new Set(records.map((record) => record.data().sourceId))];
  const sourceSnapshots = sourceIds.length === 0 ? [] : await db.getAll(
    ...sourceIds.map((sourceId) => (
      db.collection("structuredAssessmentSources").doc(sourceId)
    )),
  );
  const sourceExists = new Map(sourceIds.map((sourceId, index) => (
    [sourceId, sourceSnapshots[index].exists]
  )));
  return records.filter((record) => !sourceExists.get(record.data().sourceId));
}

async function main() {
  console.log(APPLY ? "=== APPLYING CHANGES ===" : "=== DRY RUN ===");
  if (sourceFilter) console.log(`Source filter: ${sourceFilter}`);

  const orphans = await findOrphans();
  console.log(`Found ${orphans.length} orphaned structured assessment record(s).`);
  for (const record of orphans) {
    console.log(`  DELETE ${record.ref.path} [fields: assessmentKind, sourceId]`);
  }

  if (!APPLY) {
    console.log("Dry run - no changes made. Run with --yes to delete these records.");
    return;
  }

  for (let offset = 0; offset < orphans.length; offset += 450) {
    const batch = db.batch();
    orphans.slice(offset, offset + 450).forEach((record) => batch.delete(record.ref));
    await batch.commit();
  }
  console.log(`Deleted ${orphans.length} orphaned record(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

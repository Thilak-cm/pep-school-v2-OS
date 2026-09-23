/**
 * Backfill #290 denormalized fields + rename doc IDs to sa_ prefix.
 *
 * Two migrations in one pass per source:
 * 1. Denorm: copies `sourceFileName` and `studentCount` from the source
 *    manifest onto fan-out observation records that lack them.
 * 2. Rename: migrates doc IDs from old `assessment_structured_{...}` format
 *    to the shorter `sa_{...}` format (create new doc, delete old, update
 *    recordRefs on the source manifest).
 *
 * Safe to re-run: records already carrying both denorm fields AND the sa_
 * prefix are skipped. Fields are immutable post-publish (no edit capability
 * exists), so a single pass per source is complete.
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

const OLD_PREFIX = "assessment_structured_";

function newIdFromOld(oldId) {
  if (!oldId.startsWith(OLD_PREFIX)) return null;
  return `sa_${oldId.slice(OLD_PREFIX.length)}`;
}

async function main() {
  console.log(dryRun
    ? "DRY-RUN: no writes will be applied. Re-run with --yes to apply."
    : "APPLY MODE: writes will be committed.");

  const sourcesSnap = await db.collection("structuredAssessmentSources").get();
  console.log(`Sources found: ${sourcesSnap.size}`);

  let recordsChecked = 0;
  let recordsNeedDenorm = 0;
  let recordsNeedRename = 0;
  let recordsDenormed = 0;
  let recordsRenamed = 0;
  let sourcesUpdated = 0;

  for (const sourceDoc of sourcesSnap.docs) {
    const source = sourceDoc.data();
    const sourceId = sourceDoc.id;
    const sourceFileName = source.sourceFileName || "";
    const studentCount = source.studentCount || 0;

    const recordsSnap = await db.collectionGroup("observations")
      .where("sourceId", "==", sourceId)
      .get();
    recordsChecked += recordsSnap.size;

    // --- Phase 1: denorm ---
    const needsDenorm = recordsSnap.docs.filter((recordDoc) => {
      const record = recordDoc.data();
      return record.sourceFileName !== sourceFileName ||
        record.studentCount !== studentCount;
    });

    if (needsDenorm.length) {
      recordsNeedDenorm += needsDenorm.length;
      console.log(`  ${sourceId} ("${source.assessmentName || "?"}"): ${needsDenorm.length}/${recordsSnap.size} records need {sourceFileName, studentCount}`);
      for (const recordDoc of needsDenorm) {
        console.log(`    [denorm] ${recordDoc.ref.path}`);
      }

      if (!dryRun) {
        for (let i = 0; i < needsDenorm.length; i += 400) {
          const batch = db.batch();
          needsDenorm.slice(i, i + 400).forEach((recordDoc) => {
            batch.update(recordDoc.ref, { sourceFileName, studentCount });
          });
          await batch.commit();
        }
        recordsDenormed += needsDenorm.length;
      }
    }

    // --- Phase 2: rename old doc IDs ---
    const needsRename = recordsSnap.docs.filter((recordDoc) =>
      recordDoc.id.startsWith(OLD_PREFIX),
    );

    if (needsRename.length) {
      recordsNeedRename += needsRename.length;
      console.log(`  ${sourceId}: ${needsRename.length} records need ID rename (assessment_structured_ -> sa_)`);
      const updatedRefs = [];

      for (const recordDoc of needsRename) {
        const oldPath = recordDoc.ref.path;
        const newId = newIdFromOld(recordDoc.id);
        // Parent collection path: students/{studentId}/observations
        const parentRef = recordDoc.ref.parent;
        const newRef = parentRef.doc(newId);
        console.log(`    [rename] ${oldPath} -> ${newRef.path}`);

        if (!dryRun) {
          const data = recordDoc.data();
          const batch = db.batch();
          batch.set(newRef, data);
          batch.delete(recordDoc.ref);
          await batch.commit();
          recordsRenamed++;
        }

        // Track for recordRefs update on the source manifest.
        const studentId = recordDoc.data().studentId || recordDoc.ref.parent.parent?.id;
        updatedRefs.push({ studentId, oldId: recordDoc.id, newId });
      }

      // Update recordRefs on source manifest to point to new IDs.
      if (updatedRefs.length && !dryRun) {
        const currentRefs = source.recordRefs || [];
        const newRefs = currentRefs.map((ref) => {
          const match = updatedRefs.find((u) => u.oldId === ref.observationId);
          return match
            ? { ...ref, observationId: match.newId }
            : ref;
        });
        await db.collection("structuredAssessmentSources").doc(sourceId)
          .update({ recordRefs: newRefs });
        sourcesUpdated++;
        console.log(`    [manifest] updated ${updatedRefs.length} recordRefs on ${sourceId}`);
      }
    }
  }

  console.log("---");
  console.log(`Records checked: ${recordsChecked}`);
  console.log(`Records needing denorm: ${recordsNeedDenorm}`);
  console.log(`Records needing rename: ${recordsNeedRename}`);
  if (!dryRun) {
    console.log(`Records denormed: ${recordsDenormed}`);
    console.log(`Records renamed: ${recordsRenamed}`);
    console.log(`Source manifests updated: ${sourcesUpdated}`);
  }
  console.log(dryRun
    ? "Dry-run complete. No writes applied."
    : "Done.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

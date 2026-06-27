/**
 * Backfill classroomId on existing ai_summaries docs (GH-128).
 *
 * For each student's ai_summaries subcollection, adds classroomId to any doc
 * that lacks it. Placement-aware: for transferred students, the classroomId
 * is derived from the placement that was active when the doc was generated,
 * not the student's current classroom.
 *
 * Logic:
 *   - No placements → use student's current classroomId for all docs
 *   - Has placements → match each doc's generatedAt/updatedAt/createdAt
 *     against placement date ranges to find the correct classroomId
 *   - Fallback to student's current classroomId if no placement matches
 *
 * Usage:
 *   node scripts/admin/backfill-ai-summaries-classroomid.mjs          # dry run
 *   node scripts/admin/backfill-ai-summaries-classroomid.mjs --apply  # apply changes
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const dryRun = !process.argv.includes("--apply");

if (dryRun) {
  console.log("=== DRY RUN (pass --apply to execute) ===\n");
}

/**
 * Extract a JS Date from a doc's timestamp fields.
 * Checks generatedAt, updatedAt, createdAt in priority order.
 */
function getDocTimestamp(data) {
  for (const field of ["generatedAt", "updatedAt", "createdAt"]) {
    const val = data[field];
    if (!val) continue;
    if (val.toDate) return val.toDate();
    if (val instanceof Date) return val;
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * Given a list of placements and a target date, find which classroom
 * the student was in at that time.
 *
 * Placement schema: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' | null, classroomId: string }
 * - endDate null means the placement is current (still active)
 */
function findClassroomAtDate(placements, targetDate) {
  if (!targetDate || !placements.length) return null;

  const target = targetDate.toISOString().split("T")[0]; // 'YYYY-MM-DD'

  for (const p of placements) {
    const start = p.startDate;
    const end = p.endDate;
    if (!start) continue;

    if (target >= start && (end === null || end === undefined || target <= end)) {
      return p.classroomId;
    }
  }
  return null;
}

const studentsSnap = await db.collection("students").get();
console.log(`Found ${studentsSnap.size} students.\n`);

let totalUpdated = 0;
let totalSkipped = 0;
let totalAlreadySet = 0;
let totalNoTimestamp = 0;
let batch = db.batch();
let batchCount = 0;
const BATCH_LIMIT = 400;

for (const studentDoc of studentsSnap.docs) {
  const studentId = studentDoc.id;
  const studentData = studentDoc.data();
  const currentClassroomId = studentData.classroomId;

  if (!currentClassroomId) {
    console.log(`  ${studentId}: no classroomId on student doc, skipping`);
    continue;
  }

  // Fetch placements to determine if student was transferred
  const placementsSnap = await db
    .collection("students")
    .doc(studentId)
    .collection("placements")
    .orderBy("startDate", "asc")
    .get();

  const placements = placementsSnap.docs.map((d) => d.data());
  const hasTransferHistory = placements.length > 0;

  // Fetch all ai_summaries docs
  const summariesSnap = await db
    .collection("students")
    .doc(studentId)
    .collection("ai_summaries")
    .get();

  for (const summaryDoc of summariesSnap.docs) {
    const data = summaryDoc.data();

    // Skip if classroomId already set
    if (data.classroomId) {
      totalAlreadySet++;
      continue;
    }

    let resolvedClassroomId;

    if (!hasTransferHistory) {
      // Simple case: no transfers, use current classroomId
      resolvedClassroomId = currentClassroomId;
    } else {
      // Placement-aware: find which classroom at doc generation time
      const docDate = getDocTimestamp(data);
      if (!docDate) {
        // No timestamp to match against — fall back to current
        resolvedClassroomId = currentClassroomId;
        totalNoTimestamp++;
      } else {
        resolvedClassroomId =
          findClassroomAtDate(placements, docDate) || currentClassroomId;
      }
    }

    if (dryRun) {
      const source = hasTransferHistory ? "placement-aware" : "current";
      console.log(
        `  ${studentId}/${summaryDoc.id}: would set classroomId=${resolvedClassroomId} (${source})`
      );
    } else {
      batch.update(summaryDoc.ref, { classroomId: resolvedClassroomId });
      batchCount++;
    }
    totalUpdated++;

    if (batchCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
}

// Commit remaining
if (batchCount > 0 && !dryRun) {
  await batch.commit();
}

console.log(`\n=== Summary ===`);
console.log(`Updated:      ${totalUpdated}`);
console.log(`Already set:  ${totalAlreadySet}`);
console.log(`No timestamp: ${totalNoTimestamp} (used current classroomId as fallback)`);
console.log(`Skipped:      ${totalSkipped}`);

if (dryRun) {
  console.log("\nThis was a dry run. Pass --apply to execute.");
}

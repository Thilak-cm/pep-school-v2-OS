/**
 * Verify classroomId field coverage on observation docs (PEP-333).
 *
 * Scans every students/{studentId}/observations/{observationId} doc and
 * reports how many have vs. lack the `classroomId` field.
 *
 * Usage:
 *   node scripts/admin/verify-classroomid-coverage.mjs
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const studentsSnap = await db.collection("students").get();
console.log(`Found ${studentsSnap.size} students.\n`);

let totalObs = 0;
let withClassroomId = 0;
let missingClassroomId = 0;
const missingExamples = []; // first 10 examples

for (const studentDoc of studentsSnap.docs) {
  const obsSnap = await db
    .collection("students")
    .doc(studentDoc.id)
    .collection("observations")
    .get();

  for (const obsDoc of obsSnap.docs) {
    totalObs++;
    const data = obsDoc.data();
    if (data.classroomId) {
      withClassroomId++;
    } else {
      missingClassroomId++;
      if (missingExamples.length < 10) {
        missingExamples.push({
          path: `students/${studentDoc.id}/observations/${obsDoc.id}`,
          type: data.type || "unknown",
          observedAt: data.observedAt?.toDate?.()?.toISOString() || "N/A",
          studentId: data.studentId || "N/A",
        });
      }
    }
  }
}

console.log("=== classroomId Coverage Report ===\n");
console.log(`Total observations: ${totalObs}`);
console.log(`With classroomId:   ${withClassroomId} (${totalObs ? ((withClassroomId / totalObs) * 100).toFixed(1) : 0}%)`);
console.log(`Missing classroomId: ${missingClassroomId} (${totalObs ? ((missingClassroomId / totalObs) * 100).toFixed(1) : 0}%)`);

if (missingExamples.length > 0) {
  console.log(`\nFirst ${missingExamples.length} examples missing classroomId:`);
  for (const ex of missingExamples) {
    console.log(`  ${ex.path}  type=${ex.type}  observedAt=${ex.observedAt}`);
  }
  console.log("\n⚠️  Backfill needed before PEP-333 ships.");
} else {
  console.log("\n✅ All observations have classroomId. No backfill needed.");
}

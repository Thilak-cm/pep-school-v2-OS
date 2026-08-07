/**
 * Batch 1: Recover 10 orphaned student profile docs (Whitefield branch).
 * Re-creates parent docs so subcollection data becomes visible again.
 *
 * Usage: node scripts/admin/recover-orphans-batch1.mjs
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

const STUDENTS = [
  { id: "2025-AC-COS-003", firstName: "Sashvatha", lastName: "", classroomId: "accel_cosmos" },
  { id: "2025-AC-COS-012", firstName: "Shaurya", lastName: "", classroomId: "accel_cosmos" },
  { id: "2025-AC-ELE-003", firstName: "Nilan", lastName: "", classroomId: "accel_elementary" },
  { id: "2025-AC-ELE-015", firstName: "Srushti", lastName: "", classroomId: "accel_elementary" },
  { id: "2025-AC-ELE-016", firstName: "Vaishnavi", lastName: "", classroomId: "accel_elementary" },
  { id: "2025-AC-PER-002", firstName: "Viyaansh", lastName: "", classroomId: "accel_periwinkle" },
  { id: "2025-AC-PER-013", firstName: "Saharsh", lastName: "", classroomId: "accel_periwinkle" },
  { id: "2025-AC-PER-016", firstName: "Vivaan", lastName: "", classroomId: "accel_cosmos" },
  { id: "2025-AC-PER-021", firstName: "Janhvi", lastName: "", classroomId: "accel_periwinkle" },
  { id: "2025-AC-PER-029", firstName: "Vivaan", lastName: "", classroomId: "accel_periwinkle" },
];

async function main() {
  console.log("=== Orphan Recovery Batch 1 (10 students, Whitefield) ===\n");

  for (const student of STUDENTS) {
    const docRef = db.collection("students").doc(student.id);
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`SKIP ${student.id} — doc already exists`);
      continue;
    }

    const profileData = {
      studentID: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      displayName: student.firstName + (student.lastName ? ` ${student.lastName}` : ""),
      classroomId: student.classroomId,
      branchId: "whitefield",
      status: "inactive",
      inactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      recoveredFromOrphan: true,
      createdBy: "admin-recovery",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(profileData);
    console.log(`CREATED ${student.id} — ${student.firstName} (${student.classroomId})`);
  }

  console.log("\nBatch 1 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

/**
 * Batch 2: Recover 10 orphaned student profile docs.
 * Usage: node scripts/admin/recover-orphans-batch2.mjs
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
  { id: "2025-AC-PER-030", firstName: "Tagorenath", lastName: "", classroomId: "accel_cosmos", branchId: "whitefield" },
  { id: "2025-AC-PER-032", firstName: "Vrihaan", lastName: "", classroomId: "accel_periwinkle", branchId: "whitefield" },
  { id: "2025-ACC-001", firstName: "Skand", lastName: "", classroomId: "accel_cosmos", branchId: "whitefield" },
  { id: "2025-ADO-013", firstName: "Kanav", lastName: "", classroomId: "allstars", branchId: "hsr" },
  { id: "2025-ADO-030", firstName: "Milan", lastName: "", classroomId: "allstars", branchId: "hsr" },
  { id: "2025-ADO-031", firstName: "Yashmit", lastName: "", classroomId: "allstars", branchId: "hsr" },
  { id: "2025-ADO-032", firstName: "Tulip", lastName: "", classroomId: "allstars", branchId: "hsr" },
  { id: "2025-ADO-033", firstName: "Shubhi", lastName: "", classroomId: "allstars", branchId: "hsr" },
  { id: "2025-GUL-003", firstName: "Akshleena", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-006", firstName: "Arya", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
];

async function main() {
  console.log("=== Orphan Recovery Batch 2 (10 students) ===\n");

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
      branchId: student.branchId,
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

  console.log("\nBatch 2 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

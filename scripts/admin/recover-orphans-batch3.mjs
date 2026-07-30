/**
 * Batch 3: Recover 10 orphaned student profile docs.
 * Usage: node scripts/admin/recover-orphans-batch3.mjs
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
  { id: "2025-GUL-007", firstName: "Aveer", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-013", firstName: "Harnika", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-017", firstName: "Kartik", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-022", firstName: "Panktee", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-032", firstName: "Tanveer", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-GUL-033", firstName: "Trishika", lastName: "", classroomId: "gulmohar", branchId: "hsr" },
  { id: "2025-PAR-002", firstName: "Ahaan", lastName: "", classroomId: "parijat", branchId: "hsr" },
  { id: "2025-PAR-009", firstName: "Evana", lastName: "", classroomId: "parijat", branchId: "hsr" },
  { id: "2025-PAR-011", firstName: "Kimaya", lastName: "", classroomId: "parijat", branchId: "hsr" },
  { id: "2025-PAR-031", firstName: "Vismay", lastName: "", classroomId: "parijat", branchId: "hsr" },
];

async function main() {
  console.log("=== Orphan Recovery Batch 3 (10 students) ===\n");

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

  console.log("\nBatch 3 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

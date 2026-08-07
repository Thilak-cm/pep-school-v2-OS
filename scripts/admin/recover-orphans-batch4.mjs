/**
 * Batch 4: Recover 10 orphaned student profile docs.
 * Usage: node scripts/admin/recover-orphans-batch4.mjs
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
  { id: "2025-PER-001", firstName: "Aarav", lastName: "Gupta", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PER-004", firstName: "Arundhati", lastName: "", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PER-007", firstName: "Avyaan", lastName: "", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PER-016", firstName: "Reeyansh", lastName: "", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PER-023", firstName: "Sia", lastName: "", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PER-024", firstName: "Swasti", lastName: "", classroomId: "periwinkle", branchId: "hsr" },
  { id: "2025-PLU-001", firstName: "Aavishi", lastName: "", classroomId: "plumeria", branchId: "hsr" },
  { id: "2025-PLU-006", firstName: "Arsh", lastName: "", classroomId: "plumeria", branchId: "hsr" },
  { id: "2025-PLU-007", firstName: "Atharv", lastName: "", classroomId: "plumeria", branchId: "hsr" },
  { id: "2025-PLU-016", firstName: "Ivaan", lastName: "", classroomId: "plumeria", branchId: "hsr" },
];

async function main() {
  console.log("=== Orphan Recovery Batch 4 (10 students) ===\n");

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
    console.log(`CREATED ${student.id} — ${profileData.displayName} (${student.classroomId})`);
  }

  console.log("\nBatch 4 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

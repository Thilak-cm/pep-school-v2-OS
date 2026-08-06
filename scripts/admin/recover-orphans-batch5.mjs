/**
 * Batch 5: Recover 8 orphaned student profile docs.
 * Also deletes 2026-VIN-022 (1 obs, no name, not recoverable).
 * Usage: node scripts/admin/recover-orphans-batch5.mjs
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
  { id: "2025-PLU-021", firstName: "Vedika", lastName: "", classroomId: "plumeria", branchId: "hsr" },
  { id: "2025-PLU-022", firstName: "Yalini", lastName: "", classroomId: "plumeria", branchId: "hsr" },
  { id: "2026-ADO-001", firstName: "Dhruv", lastName: "", classroomId: "adonis", branchId: "varthur" },
  { id: "2026-ADO-004", firstName: "Shanvi", lastName: "", classroomId: "adonis", branchId: "varthur" },
  { id: "2026-AED-005", firstName: "Tahaan", lastName: "", classroomId: "aedon", branchId: "varthur" },
  { id: "2026-AED-020", firstName: "Aashvi", lastName: "", classroomId: "aedon", branchId: "varthur" },
  { id: "2026-VIN-020", firstName: "Haanvika", lastName: "", classroomId: "vindhyas", branchId: "kokapet" },
];

async function main() {
  console.log("=== Orphan Recovery Batch 5 (7 students + 1 deletion) ===\n");

  // Delete 2026-VIN-022 (not recoverable)
  const deleteRef = db.collection("students").doc("2026-VIN-022");
  const deleteDoc = await deleteRef.get();
  if (deleteDoc.exists) {
    await deleteRef.delete();
    console.log("DELETED 2026-VIN-022 (no name, not recoverable)");
  } else {
    console.log("SKIP DELETE 2026-VIN-022 — doc doesn't exist (orphan subcollection only)");
  }

  // Create student profiles
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

  console.log("\nBatch 5 complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

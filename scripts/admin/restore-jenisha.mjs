/**
 * One-off script to restore Jenisha's student profile doc.
 * All her observations (31) and AI summaries are intact as orphaned subcollections.
 * Re-creating the parent doc makes them visible again.
 *
 * Usage: node scripts/admin/restore-jenisha.mjs
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

const STUDENT_ID = "2025-AC-COS-015";

async function main() {
  // Safety check: make sure the doc doesn't already exist
  const existing = await db.collection("students").doc(STUDENT_ID).get();
  if (existing.exists) {
    console.error(`Student doc ${STUDENT_ID} already exists. Aborting.`);
    process.exit(1);
  }

  // Verify orphaned observations exist
  const obsSnap = await db
    .collection(`students/${STUDENT_ID}/observations`)
    .limit(1)
    .get();
  console.log(`Orphaned observations found: ${!obsSnap.empty}`);

  const profileData = {
    studentID: STUDENT_ID,
    firstName: "Jenisha",
    lastName: "",
    displayName: "Jenisha",
    classroomId: "accel_cosmos",
    branchId: "whitefield",
    status: "active",
    createdBy: "admin-restore",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  console.log("\nWill create student doc:");
  console.log(JSON.stringify({ id: STUDENT_ID, ...profileData }, null, 2));

  await db.collection("students").doc(STUDENT_ID).set(profileData);
  console.log(`\nStudent doc ${STUDENT_ID} created successfully.`);
  console.log("Jenisha's 31 observations should now be visible in the app.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

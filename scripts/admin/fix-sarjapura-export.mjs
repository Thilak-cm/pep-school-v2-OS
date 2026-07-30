/**
 * Fix Sarjapura/Sirius Drive export.
 *
 * 1. Clears driveFolderId on the Sirius classroom doc
 * 2. Clears Drive refs from all 9 Sirius students' monthly plan docs
 * 3. Calls exportMonthlyPlanToDrive for each student (sequential)
 *
 * Usage:
 *   node scripts/admin/fix-sarjapura-export.mjs
 */

import admin from "firebase-admin";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require(
  path.resolve(__dirname, "../../firebase-service-account.json")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pep-os.firebaseio.com",
});

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const FIREBASE_API_KEY = "AIzaSyBmfHRjLww6YK7fElNGWpLZlJYu6ka9VVg";
const CF_URL = "https://asia-south1-pep-os.cloudfunctions.net/exportMonthlyPlanToDrive";
const CLASSROOM_ID = "sirius";

const DRIVE_FIELDS = [
  "driveDocId", "driveDocLink",
  "driveChecklistId", "driveChecklistLink",
  "driveExportedAt", "driveExportedBy",
];

async function getIdToken() {
  const snap = await db.collection("users")
    .where("role", "==", "superadmin")
    .limit(1)
    .get();
  if (snap.empty) throw new Error("No superadmin found");
  const uid = snap.docs[0].id;

  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()).idToken;
}

async function callCF(idToken, studentId) {
  const res = await fetch(CF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: { studentId } }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

async function main() {
  // Step 1: Clear Sirius driveFolderId
  console.log("Step 1: Clearing Sirius driveFolderId...");
  await db.collection("classrooms").doc(CLASSROOM_ID).update({
    driveFolderId: FieldValue.delete(),
  });
  console.log("  Done.\n");

  // Step 2: Get Sirius students and clear their Drive refs
  console.log("Step 2: Clearing Drive refs from Sirius students...");
  const studentsSnap = await db.collection("students")
    .where("classroomId", "==", CLASSROOM_ID)
    .where("status", "==", "active")
    .get();

  const students = [];
  for (const doc of studentsSnap.docs) {
    const planRef = db.doc(`students/${doc.id}/ai_summaries/monthly_plan`);
    const planSnap = await planRef.get();
    if (planSnap.exists && planSnap.data().driveDocLink) {
      const update = {};
      for (const field of DRIVE_FIELDS) update[field] = FieldValue.delete();
      await planRef.update(update);
    }
    students.push({ id: doc.id, name: doc.data().displayName || doc.id });
    console.log(`  ${doc.id}  ${doc.data().displayName || doc.id}`);
  }
  console.log(`  Cleared ${students.length} students.\n`);

  // Step 3: Re-export each student
  console.log("Step 3: Re-exporting to Drive (sequential)...");
  const idToken = await getIdToken();

  let ok = 0;
  for (const s of students) {
    try {
      await callCF(idToken, s.id);
      console.log(`  OK   ${s.id}  ${s.name}`);
      ok++;
    } catch (err) {
      console.log(`  FAIL ${s.id}  ${s.name}  — ${err.message}`);
    }
  }

  console.log(`\nDone: ${ok}/${students.length} exported.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

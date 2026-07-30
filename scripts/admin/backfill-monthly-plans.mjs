/**
 * Backfill monthly plans for a single classroom.
 *
 * Creates the Drive folder if missing, then calls the deployed
 * generateMonthlyPlan + exportMonthlyPlanToDrive Cloud Functions
 * for every active student in the classroom.
 *
 * Prerequisites:
 *   - Application Default Credentials (gcloud auth application-default login)
 *   - A superadmin user uid (uses --uid flag, or defaults to Thilak's uid)
 *   - Deployed Cloud Functions (generateMonthlyPlan, exportMonthlyPlanToDrive)
 *
 * Usage:
 *   node scripts/admin/backfill-monthly-plans.mjs --classroom lily              # dry run
 *   node scripts/admin/backfill-monthly-plans.mjs --classroom lily --apply      # generate + export
 *   node scripts/admin/backfill-monthly-plans.mjs --classroom lily --apply --month 2026-07
 */
import admin from "firebase-admin";
import { google } from "googleapis";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

// Firebase Web API key (needed to exchange custom token for ID token)
const FIREBASE_API_KEY = "AIzaSyAC4ibFMiIOtAlinYTXQjvQCf10jBAqKJQ";
const CF_BASE = "https://asia-south1-pep-os.cloudfunctions.net";
const SHARED_DRIVE_ID = "0ANF5MPbc7nZEUk9PVA";

// ---------------------------------------------------------------------------
// Auth helper — get a Firebase ID token for calling callable functions
// ---------------------------------------------------------------------------

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to exchange custom token: ${err}`);
  }
  const data = await res.json();
  return data.idToken;
}

/**
 * Call a Firebase callable function with auth.
 */
async function callFunction(name, data, idToken) {
  const res = await fetch(`${CF_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.message || JSON.stringify(body.error));
  }
  return body.result;
}

// ---------------------------------------------------------------------------
// Drive helpers (copied from CF to avoid import boundary issues)
// ---------------------------------------------------------------------------

function capitalize(str) {
  const s = (str || "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function getOrCreateFolder(drive, parentId, folderName) {
  const search = await drive.files.list({
    q: `name = '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    driveId: SHARED_DRIVE_ID,
    corpora: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
    fields: "files(id, name)",
  });
  if (search.data.files?.length) return search.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: "id",
  });
  return folder.data.id;
}

async function getOrCreateClassroomFolder(drive, branchName, programName, classroomName) {
  const branchFolderId = await getOrCreateFolder(drive, SHARED_DRIVE_ID, branchName);
  const programFolderId = await getOrCreateFolder(drive, branchFolderId, programName);
  return getOrCreateFolder(drive, programFolderId, classroomName);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const classroomIdx = args.indexOf("--classroom");
const monthIdx = args.indexOf("--month");
const uidIdx = args.indexOf("--uid");
const apply = args.includes("--apply");

if (classroomIdx < 0) {
  console.error("Usage: node scripts/admin/backfill-monthly-plans.mjs --classroom <id> [--apply] [--month YYYY-MM] [--uid <superadmin-uid>]");
  process.exit(1);
}

const classroomId = args[classroomIdx + 1];
const callerUid = uidIdx >= 0 ? args[uidIdx + 1] : "jaWTAJzcN7PsSK0LC8sobvUCFcf1"; // default: Thilak

// Default target month: next month
const now = new Date();
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const targetMonth = monthIdx >= 0
  ? args[monthIdx + 1]
  : `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

async function main() {
  // 1. Load classroom
  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  if (!classroomSnap.exists) {
    console.error(`Classroom "${classroomId}" not found in Firestore`);
    process.exit(1);
  }
  const classroom = classroomSnap.data();
  console.log(`\nClassroom: ${classroom.name} (${classroomId})`);
  console.log(`Program: ${classroom.programId}, Branch: ${classroom.branchId}`);
  console.log(`Target month: ${targetMonth}`);
  console.log(`Caller UID: ${callerUid}`);

  // 2. Check / create Drive folder
  const drive = await getDriveClient();

  let driveFolderId = classroom.driveFolderId;
  if (driveFolderId) {
    try {
      await drive.files.get({ fileId: driveFolderId, supportsAllDrives: true, fields: "id,name" });
      console.log(`Drive folder exists: ${driveFolderId}`);
    } catch {
      console.log(`Drive folder ${driveFolderId} is stale/missing — will create a new one`);
      driveFolderId = null;
    }
  }

  if (!driveFolderId) {
    const branchSnap = await db.collection("branches").doc(classroom.branchId).get();
    const branchName = branchSnap.exists ? branchSnap.data().name : capitalize(classroom.branchId);
    const programName = capitalize(classroom.programId);

    if (apply) {
      driveFolderId = await getOrCreateClassroomFolder(drive, branchName, programName, classroom.name);
      await db.collection("classrooms").doc(classroomId).update({ driveFolderId });
      console.log(`Created Drive folder: ${driveFolderId} (saved to Firestore)`);
    } else {
      console.log(`[DRY RUN] Would create Drive folder: ${branchName}/${programName}/${classroom.name}`);
    }
  }

  // 3. List active students
  const studentsSnap = await db.collection("students")
    .where("classroomId", "==", classroomId)
    .where("status", "==", "active")
    .get();

  const students = studentsSnap.docs.map((d) => ({
    id: d.id,
    name: d.data().displayName || d.data().name || d.id,
  }));

  console.log(`\nActive students (${students.length}):`);
  students.forEach((s) => console.log(`  - ${s.name} (${s.id})`));

  if (!apply) {
    console.log(`\n[DRY RUN] Would generate + export monthly plans for ${students.length} students.`);
    console.log("Re-run with --apply to execute.");
    process.exit(0);
  }

  // 4. Get auth token for calling Cloud Functions
  console.log("\nAuthenticating...");
  const idToken = await getIdToken(callerUid);
  console.log("Got ID token ✓");

  // 5. Generate + export for each student
  console.log(`\nGenerating and exporting plans...`);

  let success = 0;
  let failed = 0;

  for (const student of students) {
    try {
      process.stdout.write(`  ${student.name}... generating... `);
      await callFunction("generateMonthlyPlan", { studentId: student.id, targetMonth }, idToken);

      process.stdout.write("exporting... ");
      await callFunction("exportMonthlyPlanToDrive", { studentId: student.id }, idToken);

      console.log("✓");
      success++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

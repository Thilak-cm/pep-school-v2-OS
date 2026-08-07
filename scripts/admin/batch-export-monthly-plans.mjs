/**
 * Batch-export monthly plans to Google Drive for all toddler/primary students.
 *
 * Calls the deployed exportMonthlyPlanToDrive CF for each active student that
 * has a plan for the target month. Authenticates via custom token minted for
 * a superadmin user.
 *
 * Usage:
 *   node scripts/admin/batch-export-monthly-plans.mjs [--dry-run] [--month 2026-06] [--skip-existing]
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

const dryRun = process.argv.includes("--dry-run");
const skipExisting = process.argv.includes("--skip-existing");
const monthIdx = process.argv.indexOf("--month");
const explicitMonth = monthIdx !== -1 ? process.argv[monthIdx + 1] : null;

const FIREBASE_API_KEY = "AIzaSyBmfHRjLww6YK7fElNGWpLZlJYu6ka9VVg";
const CF_URL = "https://asia-south1-pep-os.cloudfunctions.net/exportMonthlyPlanToDrive";
const PLAN_PROGRAMS = ["toddler", "primary"];
const CONCURRENCY = 1; // Sequential to avoid getOrCreateFolder race condition

function resolveTargetMonth() {
  if (explicitMonth) return explicitMonth;
  const now = new Date();
  if (now.getUTCDate() >= 24) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchEligibleStudents(targetMonth) {
  const classroomsSnap = await db.collection("classrooms").get();
  const eligibleClassrooms = [];
  for (const doc of classroomsSnap.docs) {
    const data = doc.data();
    if (PLAN_PROGRAMS.includes(data.programId)) {
      eligibleClassrooms.push({ id: doc.id, name: data.name, programId: data.programId });
    }
  }

  const students = [];
  for (const classroom of eligibleClassrooms) {
    const studentsSnap = await db.collection("students")
      .where("classroomId", "==", classroom.id)
      .where("status", "==", "active")
      .get();
    for (const doc of studentsSnap.docs) {
      students.push({
        id: doc.id,
        displayName: doc.data().displayName || doc.id,
        classroomId: classroom.id,
        classroomName: classroom.name,
      });
    }
  }

  // Only include students that have a plan for the target month
  const withPlan = [];
  const noPlan = [];
  for (const s of students) {
    const snap = await db.doc(`students/${s.id}/ai_summaries/monthly_plan`).get();
    if (snap.exists && snap.data().month === targetMonth) {
      withPlan.push({ ...s, driveDocLink: snap.data().driveDocLink || null });
    } else {
      noPlan.push(s);
    }
  }

  return { students: withPlan, noPlan, classrooms: eligibleClassrooms };
}

async function findSuperadminUid() {
  const snap = await db.collection("users")
    .where("role", "==", "superadmin")
    .limit(1)
    .get();
  if (snap.empty) throw new Error("No superadmin user found in Firestore");
  return snap.docs[0].id;
}

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${err}`);
  }
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
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

async function processInBatches(items, concurrency, fn) {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

async function run() {
  const targetMonth = resolveTargetMonth();

  console.log(`\nBatch Export Monthly Plans to Drive`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Target month: ${targetMonth}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  console.log("Fetching eligible students with plans...");
  const { students, noPlan } = await fetchEligibleStudents(targetMonth);

  if (noPlan.length > 0) {
    console.log(`\nNote: ${noPlan.length} students have no ${targetMonth} plan (skipped).`);
  }

  // --skip-existing: filter out students that already have a driveDocLink
  let filtered = students;
  if (skipExisting) {
    filtered = students.filter((s) => !s.driveDocLink);
    const skippedCount = students.length - filtered.length;
    console.log(`Skipping ${skippedCount} students with existing Drive exports.`);
  }

  console.log(`\nStudents to export: ${filtered.length}\n`);

  if (dryRun) {
    console.log("Would export plans for:");
    for (const s of filtered) {
      console.log(`  ${s.id}  ${s.displayName}  (${s.classroomName})`);
    }
    console.log(`\nDone. ${filtered.length} students would be exported.`);
    return;
  }

  if (filtered.length === 0) {
    console.log("Nothing to export.");
    return;
  }

  console.log("Authenticating...");
  const uid = await findSuperadminUid();
  let idToken = await getIdToken(uid);
  console.log("Authenticated.\n");

  let succeeded = 0;
  let failed = 0;
  let idx = 0;
  const failures = [];

  await processInBatches(filtered, CONCURRENCY, async (student) => {
    const n = ++idx;
    const prefix = `[${String(n).padStart(3)}/${filtered.length}]`;
    try {
      await callCF(idToken, student.id);
      console.log(`  ${prefix} OK     ${student.id}  ${student.displayName}`);
      succeeded++;
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes("Unauthenticated")) {
        console.log(`  ${prefix} Token expired — refreshing...`);
        try {
          idToken = await getIdToken(uid);
          await callCF(idToken, student.id);
          console.log(`  ${prefix} OK     ${student.id}  ${student.displayName}  (after token refresh)`);
          succeeded++;
          return;
        } catch (retryErr) {
          const retryMsg = retryErr.message || String(retryErr);
          console.log(`  ${prefix} FAIL   ${student.id}  ${student.displayName}  — ${retryMsg} (retry failed)`);
          failures.push({ id: student.id, name: student.displayName, error: retryMsg });
          failed++;
          return;
        }
      }
      console.log(`  ${prefix} FAIL   ${student.id}  ${student.displayName}  — ${msg}`);
      failures.push({ id: student.id, name: student.displayName, error: msg });
      failed++;
    }
  });

  console.log(`\n--- Summary ---`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Total:     ${filtered.length}`);

  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`  ${f.id}  ${f.name}  — ${f.error}`);
    }
  }
}

run()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

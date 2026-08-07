/**
 * Step 3: Trigger batchAnalyzeWriting CF for each eligible student.
 *
 * Calls the deployed Cloud Function (which uses OpenRouter + latest Firestore
 * prompt) for each of the 28 students with 3+ handwritten media. Authenticates
 * via a custom token minted for a superadmin user.
 *
 * Usage:
 *   node scripts/admin/reset-writing-analysis-step3-trigger-batch.mjs [--dry-run]
 *   node scripts/admin/reset-writing-analysis-step3-trigger-batch.mjs --verify
 *
 * Concurrency is limited to 3 to avoid rate-limiting.
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
const verify = process.argv.includes("--verify");

const FIREBASE_API_KEY = "AIzaSyBmfHRjLww6YK7fElNGWpLZlJYu6ka9VVg";
const CF_URL = "https://asia-south1-pep-os.cloudfunctions.net/batchAnalyzeWriting";
const CONCURRENCY = 3;

// All 28 students with 3+ handwritten media
const ELIGIBLE_STUDENTS = [
  "2025-GUL-030", "2025-GUL-002", "2025-GUL-028", "2025-PLU-002",
  "2025-GUL-004", "2025-GUL-001", "2026-PER-003", "2025-PER-013",
  "2025-PLU-019", "2025-GUL-009", "2025-GUL-025", "2025-GUL-019",
  "2025-PER-003", "2025-GUL-021", "2025-GUL-015", "2025-PER-015",
  "2025-GUL-016", "2025-GUL-010", "2025-GUL-012", "2026-ADO-014",
  "2025-GUL-029", "2025-PLU-008", "2025-PLU-014", "2025-POW-019",
  "2025-PLU-013", "2025-GUL-011", "2025-GUL-018", "2025-PLU-005",
];

/**
 * Find a superadmin UID from Firestore users collection.
 */
async function findSuperadminUid() {
  const snap = await db.collection("users")
    .where("role", "==", "superadmin")
    .limit(1)
    .get();
  if (snap.empty) throw new Error("No superadmin user found in Firestore");
  return snap.docs[0].id;
}

/**
 * Mint a custom token via Admin SDK, then exchange it for a Firebase ID token
 * via the Auth REST API.
 */
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
  const json = await res.json();
  return json.idToken;
}

/**
 * Call the batchAnalyzeWriting callable CF for one student.
 */
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

/**
 * Process students in batches with concurrency limit.
 */
async function processInBatches(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function runTrigger() {
  console.log(`\nStep 3: Trigger batchAnalyzeWriting for ${ELIGIBLE_STUDENTS.length} students`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  if (dryRun) {
    console.log("Would call batchAnalyzeWriting for:");
    ELIGIBLE_STUDENTS.forEach((id) => console.log(`  - ${id}`));
    console.log(`\nDone. ${ELIGIBLE_STUDENTS.length} students would be triggered.`);
    return;
  }

  // Authenticate
  console.log("Finding superadmin user...");
  const uid = await findSuperadminUid();
  console.log(`Using superadmin: ${uid}`);

  console.log("Minting ID token...");
  const idToken = await getIdToken(uid);
  console.log("ID token acquired.\n");

  let succeeded = 0;
  let failed = 0;
  let idx = 0;

  const results = await processInBatches(ELIGIBLE_STUDENTS, CONCURRENCY, async (studentId) => {
    const n = ++idx;
    try {
      const result = await callCF(idToken, studentId);
      const samples = result?.sampleCount ?? "?";
      console.log(`  [${n}/${ELIGIBLE_STUDENTS.length}] OK     ${studentId} — ${samples} samples analyzed`);
      succeeded++;
      return { studentId, status: "ok", result };
    } catch (err) {
      console.log(`  [${n}/${ELIGIBLE_STUDENTS.length}] FAIL   ${studentId} — ${err.message}`);
      failed++;
      return { studentId, status: "error", error: err.message };
    }
  });

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log("\nFailed students:");
    results
      .filter((r) => r.status === "rejected" || r.value?.status === "error")
      .forEach((r) => {
        const v = r.value || r.reason;
        console.log(`  - ${v.studentId}: ${v.error || v.message}`);
      });
  }
}

async function runVerify() {
  console.log(`\nStep 3 VERIFY: Check writing_analysis regeneration\n`);

  const results = { fresh: [], missing: [], stale: [] };

  for (const studentId of ELIGIBLE_STUDENTS) {
    const docRef = db.doc(`students/${studentId}/ai_summaries/writing_analysis`);
    const snap = await docRef.get();

    if (!snap.exists) {
      results.missing.push(studentId);
      console.log(`  MISSING  ${studentId} — no writing_analysis doc`);
      continue;
    }

    const data = snap.data();
    const generatedAt = data.generatedAt?.toDate?.()
      ? data.generatedAt.toDate()
      : new Date(data.generatedAt);
    const now = new Date();
    const ageHours = (now - generatedAt) / (1000 * 60 * 60);

    if (ageHours <= 48) {
      results.fresh.push(studentId);
      console.log(`  FRESH    ${studentId} — generated ${generatedAt.toISOString().slice(0, 16)}, ${data.sampleCount} samples`);
    } else {
      results.stale.push(studentId);
      console.log(`  STALE    ${studentId} — generated ${generatedAt.toISOString().slice(0, 16)} (${Math.round(ageHours)}h ago)`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Fresh (regenerated): ${results.fresh.length}`);
  console.log(`Missing (no doc):    ${results.missing.length}`);
  console.log(`Stale (old doc):     ${results.stale.length}`);
  console.log(`Total:               ${ELIGIBLE_STUDENTS.length}`);

  if (results.missing.length === 0 && results.stale.length === 0) {
    console.log("\nPASS: All 28 students have fresh writing_analysis docs.");
  } else {
    if (results.missing.length > 0) {
      console.log(`\nMissing students (may lack 3+ unprocessed handwritten samples):`);
      results.missing.forEach((id) => console.log(`  - ${id}`));
    }
    if (results.stale.length > 0) {
      console.log(`\nStale students (old doc not replaced — CF may have skipped them):`);
      results.stale.forEach((id) => console.log(`  - ${id}`));
    }
    process.exit(1);
  }
}

(verify ? runVerify() : runTrigger())
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => process.exit(0));

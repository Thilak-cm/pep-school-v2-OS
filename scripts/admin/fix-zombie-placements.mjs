#!/usr/bin/env node

/**
 * fix-zombie-placements.mjs
 *
 * Three fixes in one script:
 * 1. Close open placements for all inactive students (27 zombies)
 * 2. Create missing placement for Jenisha Salwan (2025-AC-COS-015)
 * 3. Delete duplicate placement for Meira Aryan (2026-GUL-003)
 *
 * Usage:
 *   node scripts/admin/fix-zombie-placements.mjs          # dry-run
 *   node scripts/admin/fix-zombie-placements.mjs --apply   # write fixes
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
const dryRun = !process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --apply to write)" : "APPLY"}\n`);

  const batch = db.batch();
  let fixCount = 0;

  // ── Fix 1: Close open placements for inactive students ──────────────
  console.log("=== Fix 1: Close zombie placements for inactive students ===");

  const studentsSnap = await db.collection("students").get();
  const inactiveStudents = [];
  studentsSnap.forEach((doc) => {
    const data = doc.data();
    if ((data.status || "active") !== "active") {
      inactiveStudents.push({ id: doc.id, ...data });
    }
  });

  const today = new Date().toISOString().slice(0, 10);

  for (const student of inactiveStudents) {
    const placementsSnap = await db
      .collection("students")
      .doc(student.id)
      .collection("placements")
      .where("endDate", "==", null)
      .get();

    if (placementsSnap.empty) continue;

    const name = student.displayName || `${student.firstName || ""} ${student.lastName || ""}`.trim();
    const inactivatedAt = student.inactivatedAt?.toDate
      ? student.inactivatedAt.toDate().toISOString().slice(0, 10)
      : today;

    placementsSnap.forEach((doc) => {
      console.log(
        `  CLOSE  ${name} (${student.id}) — placement ${doc.id}, endDate → ${inactivatedAt}`
      );
      if (!dryRun) {
        batch.update(doc.ref, {
          endDate: inactivatedAt,
          status: "ended",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      fixCount++;
    });
  }

  // ── Fix 2: Create placement for Jenisha Salwan ──────────────────────
  console.log("\n=== Fix 2: Create missing placement for Jenisha Salwan ===");

  const jenishaId = "2025-AC-COS-015";
  const jenishaDoc = await db.collection("students").doc(jenishaId).get();
  if (jenishaDoc.exists) {
    const data = jenishaDoc.data();
    const startDate = data.createdAt?.toDate
      ? data.createdAt.toDate().toISOString().slice(0, 10)
      : "2026-05-31";
    const placementId = `${startDate}__${data.classroomId}`;
    const placementRef = db
      .collection("students")
      .doc(jenishaId)
      .collection("placements")
      .doc(placementId);

    console.log(
      `  CREATE  ${data.displayName} — ${placementId} (classroomId: ${data.classroomId})`
    );
    if (!dryRun) {
      batch.set(placementRef, {
        classroomId: data.classroomId,
        startDate,
        endDate: null,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    fixCount++;
  } else {
    console.log(`  SKIP  ${jenishaId} not found`);
  }

  // ── Fix 3: Delete duplicate placement for Meira Aryan ───────────────
  console.log("\n=== Fix 3: Delete duplicate placement for Meira Aryan ===");

  const meiraId = "2026-GUL-003";
  const duplicatePlacementId = "2026-05-19__gulmohar";
  const dupeRef = db
    .collection("students")
    .doc(meiraId)
    .collection("placements")
    .doc(duplicatePlacementId);

  const dupeSnap = await dupeRef.get();
  if (dupeSnap.exists) {
    console.log(`  DELETE  ${meiraId}/placements/${duplicatePlacementId}`);
    if (!dryRun) {
      batch.delete(dupeRef);
    }
    fixCount++;
  } else {
    console.log(`  SKIP  Placement ${duplicatePlacementId} not found`);
  }

  // ── Commit ──────────────────────────────────────────────────────────
  if (!dryRun && fixCount > 0) {
    await batch.commit();
    console.log(`\nCommitted ${fixCount} fix(es).`);
  } else {
    console.log(`\nTotal: ${fixCount} fix(es) found.`);
    if (dryRun && fixCount > 0) {
      console.log("Run with --apply to write.");
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

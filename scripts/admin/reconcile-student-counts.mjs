#!/usr/bin/env node

/**
 * reconcile-student-counts.mjs
 *
 * One-time reconciliation script: queries every classroom, counts active
 * students via live query, and patches classroom.studentCount where it
 * has drifted.
 *
 * Usage:
 *   node scripts/admin/reconcile-student-counts.mjs          # dry-run (default)
 *   node scripts/admin/reconcile-student-counts.mjs --apply  # write fixes
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

  // Fetch all classrooms
  const classroomsSnap = await db.collection("classrooms").get();
  const classrooms = classroomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Fetch all students in one query (faster than per-classroom queries)
  const studentsSnap = await db.collection("students").get();

  // Group active students by classroomId
  const countsByClassroom = new Map();
  studentsSnap.forEach((doc) => {
    const data = doc.data();
    const status = data.status || "active";
    if (status === "active" && data.classroomId) {
      countsByClassroom.set(
        data.classroomId,
        (countsByClassroom.get(data.classroomId) || 0) + 1
      );
    }
  });

  let mismatchCount = 0;
  let matchCount = 0;
  const batch = db.batch();

  for (const classroom of classrooms) {
    const actual = countsByClassroom.get(classroom.id) || 0;
    const stored = classroom.studentCount ?? null;

    if (stored === actual) {
      matchCount++;
      continue;
    }

    mismatchCount++;
    console.log(
      `MISMATCH  ${classroom.name || classroom.id} (${classroom.id}): ` +
      `stored=${stored}, actual=${actual}, delta=${actual - (stored || 0)}`
    );

    if (!dryRun) {
      batch.update(db.collection("classrooms").doc(classroom.id), {
        studentCount: actual,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  if (!dryRun && mismatchCount > 0) {
    await batch.commit();
    console.log(`\nPatched ${mismatchCount} classroom(s).`);
  }

  console.log(`\nSummary: ${matchCount} OK, ${mismatchCount} mismatched.`);
  if (dryRun && mismatchCount > 0) {
    console.log("Run with --apply to fix.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

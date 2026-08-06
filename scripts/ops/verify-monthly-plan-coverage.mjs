/**
 * Verify monthly plan coverage for all active students.
 *
 * Compares each active student's ai_summaries/monthly_plan doc against the
 * current month in IST and reports missing or stale plans.
 *
 * Usage:
 *   node scripts/ops/verify-monthly-plan-coverage.mjs
 *   node scripts/ops/verify-monthly-plan-coverage.mjs --month 2026-08
 *   node scripts/ops/verify-monthly-plan-coverage.mjs --classroomId adonis
 *   node scripts/ops/verify-monthly-plan-coverage.mjs --programIds toddler,primary
 */

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

function getCurrentMonthIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function parseArgs(argv) {
  const args = { month: null, classroomId: null, programIds: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--month") {
      args.month = argv[++i] || null;
    } else if (arg === "--classroomId") {
      args.classroomId = argv[++i] || null;
    } else if (arg === "--programIds") {
      args.programIds = (argv[++i] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function toMonthIST(value) {
  if (!value) return null;
  const ts = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(ts.getTime())) return null;
  const ist = new Date(ts.getTime() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function printHelp() {
  console.log(`
Verify monthly plan coverage for active students.

Usage:
  node scripts/ops/verify-monthly-plan-coverage.mjs
  node scripts/ops/verify-monthly-plan-coverage.mjs --month YYYY-MM
  node scripts/ops/verify-monthly-plan-coverage.mjs --classroomId <classroomId>
  node scripts/ops/verify-monthly-plan-coverage.mjs --programIds toddler,primary
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const expectedMonth = args.month || getCurrentMonthIST();
  console.log(`Checking monthly plan coverage for ${expectedMonth}`);
  if (args.classroomId) {
    console.log(`Classroom filter: ${args.classroomId}`);
  }
  if (args.programIds?.length) {
    console.log(`Program filter:     ${args.programIds.join(", ")}`);
  }
  console.log();

  let studentQuery = db.collection("students").where("status", "==", "active");
  if (args.classroomId) {
    studentQuery = studentQuery.where("classroomId", "==", args.classroomId);
  }

  const studentsSnap = await studentQuery.get();
  const students = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const classroomIdsNeeded = new Set();
  for (const student of students) {
    if (!student.programId && student.classroomId) {
      classroomIdsNeeded.add(student.classroomId);
    }
  }

  const classroomProgramMap = {};
  if (classroomIdsNeeded.size > 0) {
    const classroomSnaps = await Promise.all(
      [...classroomIdsNeeded].map((id) => db.collection("classrooms").doc(id).get()),
    );
    for (const snap of classroomSnaps) {
      if (snap.exists) {
        classroomProgramMap[snap.id] = snap.data().programId || null;
      }
    }
  }

  const scopedStudents = students.filter((student) => {
    if (!args.programIds?.length) return true;
    const programId = student.programId || classroomProgramMap[student.classroomId] || null;
    return args.programIds.includes(programId);
  });

  console.log(`Active students in scope: ${scopedStudents.length}`);

  const summary = {
    total: scopedStudents.length,
    current: 0,
    stale: 0,
    missing: 0,
    currentStudents: [],
    staleStudents: [],
    missingStudents: [],
  };

  for (let i = 0; i < scopedStudents.length; i += BATCH_SIZE) {
    const batch = scopedStudents.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (student) => {
      const planSnap = await db
        .collection("students")
        .doc(student.id)
        .collection("ai_summaries")
        .doc("monthly_plan")
        .get();

      if (!planSnap.exists) {
        summary.missing++;
        summary.missingStudents.push({
          id: student.id,
          name: student.displayName || student.firstName || student.id,
          classroomId: student.classroomId || null,
        });
        return;
      }

      const plan = planSnap.data();
      const planMonth = plan.month || toMonthIST(plan.generatedAt || plan.driveExportedAt || null);

      if (planMonth === expectedMonth) {
        summary.current++;
        summary.currentStudents.push({
          id: student.id,
          name: student.displayName || student.firstName || student.id,
          month: planMonth,
          generatedAt: plan.generatedAt || null,
        });
        return;
      }

      summary.stale++;
      summary.staleStudents.push({
        id: student.id,
        name: student.displayName || student.firstName || student.id,
        month: planMonth || "unknown",
        generatedAt: plan.generatedAt || null,
        classroomId: student.classroomId || null,
      });
    }));

    process.stdout.write(`  checked ${Math.min(i + BATCH_SIZE, scopedStudents.length)}/${scopedStudents.length}\r`);
  }

  console.log("\n");
  console.log("=== Summary ===");
  console.log(`Expected month:            ${expectedMonth}`);
  console.log(`Total active students:     ${summary.total}`);
  console.log(`Current monthly plans:     ${summary.current}`);
  console.log(`Stale monthly plans:       ${summary.stale}`);
  console.log(`Missing monthly plans:     ${summary.missing}`);

  if (summary.staleStudents.length) {
    console.log(`\n--- Stale plans (${summary.staleStudents.length}) ---`);
    for (const row of summary.staleStudents) {
      console.log(`  ${row.id} | ${row.name} | last=${row.month} | classroom=${row.classroomId || "unknown"}`);
    }
  }

  if (summary.missingStudents.length) {
    console.log(`\n--- Missing plans (${summary.missingStudents.length}) ---`);
    for (const row of summary.missingStudents) {
      console.log(`  ${row.id} | ${row.name} | classroom=${row.classroomId || "unknown"}`);
    }
  }

  if (!summary.staleStudents.length && !summary.missingStudents.length) {
    console.log("\n✓ All active students in scope have the expected monthly plan.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});

/**
 * Recover missing or stale monthly plans by republishing only the students
 * whose current monthly_plan month is not the requested target month.
 *
 * This is intentionally conservative:
 * - it scopes to active students
 * - it resolves program via student doc or classroom fallback
 * - it publishes only stale/missing students to the existing worker topic
 * - the worker's own idempotency gate skips already-current plans
 *
 * Usage:
 *   node scripts/ops/recover-monthly-plans.mjs
 *   node scripts/ops/recover-monthly-plans.mjs --month 2026-08
 *   node scripts/ops/recover-monthly-plans.mjs --programIds toddler,primary
 *   node scripts/ops/recover-monthly-plans.mjs --dry-run
 */

import admin from "firebase-admin";
import { PubSub } from "@google-cloud/pubsub";

process.env.GCLOUD_PROJECT = "pep-os";
process.env.GCP_PROJECT = "pep-os";
process.env.GOOGLE_CLOUD_PROJECT = "pep-os";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const pubsub = new PubSub({ projectId: "pep-os" });
const topic = pubsub.topic("monthly-plan-workers");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BATCH_SIZE = 25;
const DEFAULT_PROGRAM_IDS = ["toddler", "primary"];

function getCurrentMonthIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function parseArgs(argv) {
  const args = {
    month: null,
    programIds: DEFAULT_PROGRAM_IDS,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--month") {
      args.month = argv[++i] || null;
    } else if (arg === "--programIds") {
      const raw = argv[++i] || "";
      args.programIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
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
Recover monthly plans for stale or missing active students.

Usage:
  node scripts/ops/recover-monthly-plans.mjs
  node scripts/ops/recover-monthly-plans.mjs --month YYYY-MM
  node scripts/ops/recover-monthly-plans.mjs --programIds toddler,primary
  node scripts/ops/recover-monthly-plans.mjs --dry-run
`);
}

async function resolveClassroomPrograms(students) {
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

  return classroomProgramMap;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const targetMonth = args.month || getCurrentMonthIST();
  const programIds = args.programIds?.length ? args.programIds : DEFAULT_PROGRAM_IDS;

  console.log(`Recovering monthly plans for ${targetMonth}`);
  console.log(`Program scope: ${programIds.join(", ")}`);
  console.log(`Mode: ${args.dryRun ? "dry-run" : "publish"}`);
  console.log();

  const studentsSnap = await db.collection("students").where("status", "==", "active").get();
  const students = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const classroomProgramMap = await resolveClassroomPrograms(students);

  const scopedStudents = students.filter((student) => {
    const programId = student.programId || classroomProgramMap[student.classroomId] || null;
    return programIds.includes(programId);
  });

  console.log(`Active students in scope: ${scopedStudents.length}`);

  const stale = [];
  const missing = [];
  const current = [];

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
        missing.push(student);
        return;
      }

      const plan = planSnap.data();
      const planMonth = plan.month || toMonthIST(plan.generatedAt || plan.driveExportedAt || null);
      if (planMonth === targetMonth) {
        current.push(student);
      } else {
        stale.push({
          ...student,
          planMonth: planMonth || "unknown",
        });
      }
    }));

    process.stdout.write(`  checked ${Math.min(i + BATCH_SIZE, scopedStudents.length)}/${scopedStudents.length}\r`);
  }

  console.log("\n");
  console.log("=== Recovery Plan ===");
  console.log(`Current: ${current.length}`);
  console.log(`Stale:   ${stale.length}`);
  console.log(`Missing: ${missing.length}`);
  console.log(`To publish: ${stale.length + missing.length}`);

  if (stale.length) {
    console.log(`\n--- Stale (${stale.length}) ---`);
    for (const student of stale) {
      console.log(`  ${student.id} | ${student.displayName || student.firstName || student.id} | last=${student.planMonth}`);
    }
  }

  if (missing.length) {
    console.log(`\n--- Missing (${missing.length}) ---`);
    for (const student of missing) {
      console.log(`  ${student.id} | ${student.displayName || student.firstName || student.id}`);
    }
  }

  if (args.dryRun) {
    console.log("\nDry run complete; no messages published.");
    process.exit(0);
  }

  const toPublish = [...stale, ...missing];
  let published = 0;
  let failed = 0;

  for (let i = 0; i < toPublish.length; i += BATCH_SIZE) {
    const batch = toPublish.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (student) => {
      try {
        await topic.publishMessage({
          data: Buffer.from(JSON.stringify({ studentId: student.id, targetMonth })),
        });
        published++;
      } catch (err) {
        failed++;
        console.error(`[publish] failed for ${student.id}: ${err.message}`);
      }
    }));
  }

  console.log("\n=== Publish Result ===");
  console.log(`Published: ${published}`);
  console.log(`Failed:    ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Recovery failed:", err.message);
  process.exit(1);
});

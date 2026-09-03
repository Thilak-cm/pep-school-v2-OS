/**
 * Audit monthly plan Drive exports for active students.
 *
 * For every active student whose Firestore monthly_plan doc matches the
 * target month, this script probes Google Drive to confirm the plan doc
 * and checklist doc are actually accessible (not missing, not trashed).
 *
 * Catches two failure modes:
 *   1. MISSING_EXPORT  - Drive export never ran (no driveDocId in Firestore)
 *   2. FILE_GONE       - Export ran, file ID is recorded, but file is deleted
 *                        or trashed in Drive
 *
 * The script is always read-only. Results are printed to stdout; exit code
 * is non-zero when any failures are found.
 *
 * Usage:
 *   node scripts/ops/audit-monthly-plan-drive.mjs
 *   node scripts/ops/audit-monthly-plan-drive.mjs --month 2026-09
 *   node scripts/ops/audit-monthly-plan-drive.mjs --classroomId gulmohar
 *   node scripts/ops/audit-monthly-plan-drive.mjs --programIds toddler,primary
 *   node scripts/ops/audit-monthly-plan-drive.mjs --no-drive-probe   (Firestore-only, faster)
 */

import admin from "firebase-admin";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BATCH_SIZE = 20; // concurrent Firestore reads
const PROBE_CONCURRENCY = 10; // concurrent Drive API probes
const DEFAULT_PROGRAM_IDS = ["toddler", "primary"];

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    month: null,
    classroomId: null,
    programIds: null,
    noDriveProbe: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--month") args.month = argv[++i] || null;
    else if (arg === "--classroomId") args.classroomId = argv[++i] || null;
    else if (arg === "--programIds") {
      args.programIds = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--no-drive-probe") args.noDriveProbe = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function getCurrentMonthIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function printHelp() {
  console.log(`
Audit monthly plan Drive exports for active students.

Usage:
  node scripts/ops/audit-monthly-plan-drive.mjs [options]

Options:
  --month YYYY-MM          Target month (default: current IST month)
  --classroomId ID         Limit to one classroom
  --programIds IDS         Comma-separated program filter (default: toddler,primary)
  --no-drive-probe         Skip Drive API probes; report only Firestore coverage
  --help                   Show this help

Exit code: 0 = all OK, 1 = failures found or script error.
`);
}

// ---------------------------------------------------------------------------
// Drive helpers
// ---------------------------------------------------------------------------

async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/**
 * Probe a single Drive file ID. Returns one of:
 *   "ok"        - file exists and is not trashed
 *   "trashed"   - file exists but is trashed
 *   "not_found" - 404 (file deleted or never existed)
 *   "error:..."  - unexpected error (permissions, quota, etc.)
 */
async function probeFile(drive, fileId) {
  if (!fileId) return "not_found";
  try {
    const res = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "id,trashed",
    });
    return res.data.trashed ? "trashed" : "ok";
  } catch (err) {
    const status = err?.code ?? err?.response?.status;
    if (status === 404) return "not_found";
    return `error:${status ?? err.message}`;
  }
}

// Run promises in chunks of `size` concurrently.
async function runBatched(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    process.stdout.write(
      `  probing Drive... ${Math.min(i + size, items.length)}/${items.length}\r`,
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }

  const targetMonth = args.month || getCurrentMonthIST();
  const programFilter = args.programIds?.length ? args.programIds : DEFAULT_PROGRAM_IDS;

  console.log("=== Monthly Plan Drive Audit ===");
  console.log(`Target month:  ${targetMonth}`);
  console.log(`Program scope: ${programFilter.join(", ")}`);
  if (args.classroomId) console.log(`Classroom:     ${args.classroomId}`);
  console.log(`Drive probe:   ${args.noDriveProbe ? "disabled" : "enabled"}`);
  console.log();

  // 1. Load students
  let query = db.collection("students").where("status", "==", "active");
  if (args.classroomId) query = query.where("classroomId", "==", args.classroomId);
  const studentsSnap = await query.get();
  const allStudents = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Resolve classroom → program for students missing programId
  const classroomIdsNeeded = new Set(
    allStudents.filter((s) => !s.programId && s.classroomId).map((s) => s.classroomId),
  );
  const classroomProgramMap = {};
  if (classroomIdsNeeded.size) {
    const snaps = await Promise.all([...classroomIdsNeeded].map((id) => db.collection("classrooms").doc(id).get()));
    for (const snap of snaps) {
      if (snap.exists) classroomProgramMap[snap.id] = snap.data().programId || null;
    }
  }

  const students = allStudents.filter((s) => {
    const prog = s.programId || classroomProgramMap[s.classroomId] || null;
    return programFilter.includes(prog);
  });
  console.log(`Active students in scope: ${students.length}`);

  // 2. Read Firestore monthly_plan docs in batches
  const firestoreResults = []; // { student, plan or null }

  for (let i = 0; i < students.length; i += BATCH_SIZE) {
    const batch = students.slice(i, i + BATCH_SIZE);
    const planSnaps = await Promise.all(
      batch.map((s) =>
        db.collection("students").doc(s.id)
          .collection("ai_summaries").doc("monthly_plan").get(),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      firestoreResults.push({
        student: batch[j],
        plan: planSnaps[j].exists ? planSnaps[j].data() : null,
      });
    }
    process.stdout.write(`  reading Firestore... ${Math.min(i + BATCH_SIZE, students.length)}/${students.length}\r`);
  }
  console.log(`  reading Firestore... ${students.length}/${students.length} done`);

  // 3. Classify by Firestore status
  const noplan = [];           // no monthly_plan doc at all
  const wrongMonth = [];       // plan exists but not for targetMonth
  const missingExport = [];    // plan for targetMonth but no driveDocId
  const hasExport = [];        // plan for targetMonth + driveDocId present

  for (const { student, plan } of firestoreResults) {
    if (!plan) {
      noplan.push({ student, plan: null });
    } else if (plan.month !== targetMonth) {
      wrongMonth.push({ student, plan });
    } else if (!plan.driveDocId) {
      missingExport.push({ student, plan });
    } else {
      hasExport.push({ student, plan });
    }
  }

  // 4. Probe Drive for students that have a driveDocId
  const driveOk = [];
  const driveTrashed = [];
  const driveNotFound = [];
  const driveError = [];

  if (!args.noDriveProbe && hasExport.length > 0) {
    console.log(`\nProbing Drive for ${hasExport.length} students with recorded export IDs...`);
    const drive = await getDriveClient();

    const probed = await runBatched(hasExport, PROBE_CONCURRENCY, async ({ student, plan }) => {
      const [planStatus, checklistStatus] = await Promise.all([
        probeFile(drive, plan.driveDocId),
        probeFile(drive, plan.driveChecklistId),
      ]);
      return { student, plan, planStatus, checklistStatus };
    });
    console.log(`  probing Drive... ${hasExport.length}/${hasExport.length} done`);

    for (const r of probed) {
      // Both docs must be ok for the student to be fully green
      const planOk = r.planStatus === "ok";
      const checklistOk = !r.plan.driveChecklistId || r.checklistStatus === "ok";

      if (planOk && checklistOk) {
        driveOk.push(r);
      } else if (r.planStatus === "trashed" || r.checklistStatus === "trashed") {
        driveTrashed.push(r);
      } else if (r.planStatus === "not_found" || r.checklistStatus === "not_found") {
        driveNotFound.push(r);
      } else {
        driveError.push(r);
      }
    }
  } else if (args.noDriveProbe) {
    // Treat all as "assumed ok" for counting — Drive probe skipped
    driveOk.push(...hasExport.map((e) => ({ ...e, planStatus: "assumed_ok", checklistStatus: "assumed_ok" })));
  }

  // 5. Report
  const totalFailures = noplan.length + wrongMonth.length + missingExport.length +
    driveTrashed.length + driveNotFound.length + driveError.length;

  console.log("\n");
  console.log("=== Summary ===");
  console.log(`Total in scope:           ${students.length}`);
  console.log(`OK (Drive verified):      ${driveOk.length}${args.noDriveProbe ? " (probe skipped)" : ""}`);
  console.log(`MISSING_EXPORT:           ${missingExport.length}  ← plan generated, Drive export failed`);
  console.log(`DRIVE_FILE_GONE:          ${driveNotFound.length}  ← export recorded but file deleted`);
  console.log(`DRIVE_FILE_TRASHED:       ${driveTrashed.length}  ← file exists but in trash`);
  console.log(`DRIVE_PROBE_ERROR:        ${driveError.length}  ← unexpected probe error (permissions/quota)`);
  console.log(`WRONG_MONTH:              ${wrongMonth.length}  ← plan exists but for a different month`);
  console.log(`NO_PLAN:                  ${noplan.length}  ← no monthly_plan doc at all`);
  console.log(`─────────────────────────────────────────`);
  console.log(`Total needing attention:  ${totalFailures}`);

  // Helper: group students by classroomId
  function byClassroom(list) {
    const map = {};
    for (const item of list) {
      const cid = item.student.classroomId || "unknown";
      if (!map[cid]) map[cid] = [];
      map[cid].push(item);
    }
    return map;
  }

  function printGroup(label, items, extraFn) {
    if (!items.length) return;
    console.log(`\n--- ${label} (${items.length}) ---`);
    const grouped = byClassroom(items);
    for (const [classroomId, group] of Object.entries(grouped).sort()) {
      console.log(`  [${classroomId}]`);
      for (const item of group) {
        const name = item.student.displayName || item.student.firstName || item.student.id;
        const extra = extraFn ? extraFn(item) : "";
        console.log(`    ${item.student.id}  ${name}${extra}`);
      }
    }
  }

  printGroup(
    "MISSING_EXPORT - plan generated, no Drive docs written",
    missingExport,
    (r) => `  [generated: ${r.plan.generatedAt?.slice(0, 10) ?? "?"}]`,
  );

  printGroup(
    "DRIVE_FILE_GONE - file ID recorded but file not found in Drive",
    driveNotFound,
    (r) => `  [planId: ${r.plan.driveDocId}  planStatus: ${r.planStatus}  checklistStatus: ${r.checklistStatus}]`,
  );

  printGroup(
    "DRIVE_FILE_TRASHED - file in Drive trash",
    driveTrashed,
    (r) => `  [planId: ${r.plan.driveDocId}  planStatus: ${r.planStatus}  checklistStatus: ${r.checklistStatus}]`,
  );

  printGroup(
    "DRIVE_PROBE_ERROR - unexpected Drive error",
    driveError,
    (r) => `  [planId: ${r.plan.driveDocId}  planStatus: ${r.planStatus}  checklistStatus: ${r.checklistStatus}]`,
  );

  printGroup(
    "WRONG_MONTH - plan exists but not for target month",
    wrongMonth,
    (r) => `  [has: ${r.plan.month ?? "?"}  expected: ${targetMonth}]`,
  );

  printGroup(
    "NO_PLAN - no monthly_plan doc in Firestore at all",
    noplan,
    null,
  );

  if (totalFailures === 0) {
    console.log(`\nAll ${students.length} students have verified Drive exports for ${targetMonth}.`);
  } else {
    console.log(`\nAction required: ${totalFailures} students need Drive export recovery.`);
    console.log("To re-export Drive docs only (without re-generating plans):");
    console.log("  use the exportMonthlyPlanToDrive callable CF per student, or");
    console.log("  run scripts/ops/recover-monthly-plans-drive-only.mjs (to be created).");
  }

  process.exit(totalFailures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nAudit failed:", err.message);
  process.exit(1);
});

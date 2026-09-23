/**
 * Clean up dangling report docs in Firestore.
 *
 * A "dangling" report is an ai_summaries doc (kind == "report") whose
 * driveDocId points at a Google Doc that is trashed or gone (404). This
 * happens when someone removes report docs directly in Google Drive instead
 * of through the app (teachers cannot delete reports in-app - admin only -
 * so after regenerating a report their only cleanup option is Drive).
 * First seen: Sep 2026 weekly driveIntegrityCheck alert (2026-ACC-005,
 * 2026-LIL-003).
 *
 * What it does (with --yes): deletes the dangling Firestore report doc.
 * What it deliberately does NOT do:
 *   - Touch Drive: the doc is already in trash; leaving it preserves the
 *     30-day recovery window (same principle as the read-only verifier).
 *   - Touch summary CSVs: the per-student CSV row is replaced on every
 *     re-export, so it already belongs to the NEWER report. Removing it
 *     (like the deleteStudentReport callable does) would delete the
 *     current row. Trade-off documented here so future agents don't "fix"
 *     this by copying the callable's CSV logic.
 *
 * Safety guard: by default a dangling report is only deleted when the same
 * student has a NEWER report of the same reportType whose Drive doc is
 * alive - i.e. it is provably superseded. Use --include-latest to also
 * delete dangling reports that are the student's latest (e.g. a report
 * whose Drive doc was deleted with no regeneration). Probe errors
 * (403/quota/network) are never treated as dangling.
 *
 * Dry-run by default. Requires --yes to apply deletions.
 *
 * Usage:
 *   node scripts/ops/cleanup-dangling-reports.mjs                       # dry-run, all active students
 *   node scripts/ops/cleanup-dangling-reports.mjs --student 2026-ACC-005,2026-LIL-003
 *   node scripts/ops/cleanup-dangling-reports.mjs --classroomId lily
 *   node scripts/ops/cleanup-dangling-reports.mjs --report-type term
 *   node scripts/ops/cleanup-dangling-reports.mjs --include-latest
 *   node scripts/ops/cleanup-dangling-reports.mjs --student 2026-ACC-005 --yes
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../../functions/package.json"));
const { google } = require("googleapis");
const serviceAccount = require(path.resolve(__dirname, "../../firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const STUDENT_BATCH_SIZE = 20; // concurrent Firestore reads
const PROBE_CONCURRENCY = 10; // concurrent Drive API probes

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    students: null,
    classroomId: null,
    reportType: null,
    includeLatest: false,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--student") {
      args.students = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--classroomId") args.classroomId = argv[++i] || null;
    else if (arg === "--report-type") args.reportType = argv[++i] || null;
    else if (arg === "--include-latest") args.includeLatest = true;
    else if (arg === "--yes") args.yes = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg} (see --help)`);
      process.exit(1);
    }
  }
  if (args.reportType && !["term", "baseline"].includes(args.reportType)) {
    console.error(`--report-type must be "term" or "baseline", got: ${args.reportType}`);
    process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`
Clean up Firestore report docs whose Drive doc is trashed or gone.

Usage:
  node scripts/ops/cleanup-dangling-reports.mjs [options]

Options:
  --student IDS       Comma-separated student IDs (default: all active students)
  --classroomId ID    Limit to one classroom
  --report-type TYPE  Only "term" or "baseline" (default: both)
  --include-latest    Also delete dangling reports that are the student's
                      latest of that type (default: only provably superseded)
  --yes               Apply deletions (default: dry-run)
  --help              Show this help

Exit code: 0 = clean or deletions applied, 1 = error, 2 = dry-run found candidates.
`);
}

// ---------------------------------------------------------------------------
// Drive probe (same verdict semantics as functions/verification/driveIntegrity.js)
// ---------------------------------------------------------------------------

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

/** Returns "ok" | "dead" (404 or trashed) | "unverifiable" (403/quota/network). */
async function probeFile(drive, fileId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await drive.files.get({ fileId, supportsAllDrives: true, fields: "id,trashed" });
      return res.data.trashed ? "dead" : "ok";
    } catch (err) {
      const status = err?.code ?? err?.response?.status;
      if (status === 404) return "dead";
      if (status === 403) return "unverifiable"; // access lost, NOT proof of deletion
      // transient: retry once
    }
  }
  return "unverifiable";
}

async function runBatched(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...await Promise.all(chunk.map(fn)));
  }
  return results;
}

function toDate(v) {
  return v?.toDate ? v.toDate() : (v ? new Date(v) : null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }

  console.log("=== Dangling Report Cleanup ===");
  console.log(`Mode:          ${args.yes ? "APPLY (deletions will be written)" : "DRY-RUN"}`);
  console.log(`Scope:         ${args.students ? args.students.join(", ") : "all active students"}`);
  if (args.classroomId) console.log(`Classroom:     ${args.classroomId}`);
  console.log(`Report type:   ${args.reportType || "term + baseline"}`);
  console.log(`Latest guard:  ${args.includeLatest ? "OFF (--include-latest)" : "ON (superseded-only)"}`);
  console.log();

  // 1. Resolve student IDs
  let studentIds;
  if (args.students) {
    studentIds = args.students;
  } else {
    let query = db.collection("students").where("status", "==", "active");
    if (args.classroomId) query = query.where("classroomId", "==", args.classroomId);
    const snap = await query.get();
    studentIds = snap.docs.map((d) => d.id);
  }
  console.log(`Students in scope: ${studentIds.length}`);

  // 2. Load all report docs per student
  const reports = []; // { studentId, docId, reportType, generatedAt, driveDocId }
  for (let i = 0; i < studentIds.length; i += STUDENT_BATCH_SIZE) {
    const batch = studentIds.slice(i, i + STUDENT_BATCH_SIZE);
    const snaps = await Promise.all(batch.map((sid) =>
      db.collection("students").doc(sid)
        .collection("ai_summaries").where("kind", "==", "report").get(),
    ));
    batch.forEach((sid, j) => {
      for (const doc of snaps[j].docs) {
        const d = doc.data();
        if (args.reportType && (d.reportType || "term") !== args.reportType) continue;
        reports.push({
          studentId: sid,
          docId: doc.id,
          reportType: d.reportType || "term",
          generatedAt: toDate(d.generatedAt),
          driveDocId: d.driveDocId || null,
        });
      }
    });
    process.stdout.write(`  reading Firestore... ${Math.min(i + STUDENT_BATCH_SIZE, studentIds.length)}/${studentIds.length}\r`);
  }
  console.log(`  reading Firestore... done (${reports.length} report docs found)`);

  const probeable = reports.filter((r) => r.driveDocId);
  console.log(`Reports with driveDocId to probe: ${probeable.length}\n`);

  // 3. Probe Drive
  const drive = getDriveClient();
  let probed = 0;
  await runBatched(probeable, PROBE_CONCURRENCY, async (r) => {
    r.verdict = await probeFile(drive, r.driveDocId);
    probed++;
    process.stdout.write(`  probing Drive... ${probed}/${probeable.length}\r`);
  });
  if (probeable.length) console.log(`  probing Drive... ${probeable.length}/${probeable.length} done\n`);

  const dead = probeable.filter((r) => r.verdict === "dead");
  const unverifiable = probeable.filter((r) => r.verdict === "unverifiable");

  // 4. Superseded guard: only delete when a newer same-type report is alive
  const candidates = [];
  const blocked = []; // dead but latest-of-type; needs --include-latest
  for (const r of dead) {
    const newerAlive = probeable.some((o) =>
      o.studentId === r.studentId &&
      o.reportType === r.reportType &&
      o.verdict === "ok" &&
      o.generatedAt && r.generatedAt && o.generatedAt > r.generatedAt,
    );
    if (newerAlive || args.includeLatest) candidates.push({ ...r, superseded: newerAlive });
    else blocked.push(r);
  }

  // 5. Report
  console.log("=== Summary ===");
  console.log(`Probed:                 ${probeable.length}`);
  console.log(`Alive:                  ${probeable.length - dead.length - unverifiable.length}`);
  console.log(`Dangling (dead):        ${dead.length}`);
  console.log(`Unverifiable (skipped): ${unverifiable.length}  <- 403/transient, never deleted`);
  console.log(`Delete candidates:      ${candidates.length}`);
  console.log(`Blocked by guard:       ${blocked.length}  <- latest of type; rerun with --include-latest`);

  const fmt = (r) =>
    `  students/${r.studentId}/ai_summaries/${r.docId}` +
    `  [${r.reportType}, generated ${r.generatedAt?.toISOString().slice(0, 10) ?? "?"}, drive ${r.driveDocId}]`;

  if (candidates.length) {
    console.log(`\n--- Will delete (${candidates.length}) ---`);
    for (const r of candidates) console.log(fmt(r) + (r.superseded ? "" : "  (NOT superseded - --include-latest)"));
  }
  if (blocked.length) {
    console.log(`\n--- Dangling but blocked by superseded guard (${blocked.length}) ---`);
    for (const r of blocked) console.log(fmt(r));
  }
  if (unverifiable.length) {
    console.log(`\n--- Unverifiable (${unverifiable.length}) ---`);
    for (const r of unverifiable) console.log(fmt(r));
  }

  if (!candidates.length) {
    console.log("\nNothing to delete.");
    process.exit(0);
  }

  // 6. Apply
  if (!args.yes) {
    console.log(`\nDRY-RUN: no writes performed. Re-run with --yes to delete ${candidates.length} doc(s).`);
    process.exit(2);
  }

  console.log("\nDeleting...");
  for (const r of candidates) {
    await db.collection("students").doc(r.studentId).collection("ai_summaries").doc(r.docId).delete();
    console.log(`  deleted students/${r.studentId}/ai_summaries/${r.docId}`);
  }
  console.log(`\nDone. Deleted ${candidates.length} dangling report doc(s).`);
  console.log("Drive trash untouched (30-day recovery window preserved).");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nCleanup failed:", err.message);
  process.exit(1);
});

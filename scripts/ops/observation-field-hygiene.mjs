/**
 * Observation dead-field cleanup (#294).
 *
 * Scans students/{sid}/observations and deletes proven-dead fields
 * (DEAD_FIELDS: attendanceStatus, branchId) from every doc carrying them.
 *
 * Read-only by default: prints the delete plan WITHOUT writing.
 * Requires --yes to apply FieldValue.delete() updates.
 * Idempotent and re-runnable (re-run after deploys to catch docs written by
 * stale cached clients).
 *
 * For the read-only census (doc-ID shapes, field frequency per type), use
 * observation-census.mjs instead - no write concerns.
 *
 * Dry-run output identifies doc paths and field NAMES only - no field values
 * are printed (Firestore mutation script convention, see CLAUDE.md).
 *
 * Usage:
 *   node scripts/ops/observation-field-hygiene.mjs                 # dry-run
 *   node scripts/ops/observation-field-hygiene.mjs --limit 500     # smoke test
 *   node scripts/ops/observation-field-hygiene.mjs --yes           # apply
 *   node scripts/ops/observation-field-hygiene.mjs --yes --limit N # partial apply (warns)
 *
 * Exit codes: 0 = clean or writes applied, 1 = error,
 *             2 = dry-run found candidates (convention: cleanup-dangling-reports.mjs).
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import {
  DEAD_FIELDS,
  fieldsToDelete,
} from "./observation-field-hygiene.helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../../functions/package.json"));
const serviceAccount = require(path.resolve(__dirname, "../../firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const { FieldValue, FieldPath } = admin.firestore;

const PAGE_SIZE = 1000; // collection-group pagination
const DELETE_BATCH_SIZE = 400; // < 500 Firestore batch limit, headroom for safety
const SAMPLE_PATHS = 20; // dry-run: how many affected doc paths to print

function parseArgs(argv) {
  const args = { yes: false, limit: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--yes") args.yes = true;
    else if (arg === "--limit") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        console.error(`--limit requires a positive integer, got: ${raw}`);
        process.exit(1);
      }
      args.limit = n;
    }
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function printCounts(label, counts) {
  console.log(`\n${label}`);
  for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(32)} ${count}`);
  }
}

async function scan(limit) {
  /** @type {Array<{ref: FirebaseFirestore.DocumentReference, fields: string[]}>} */
  const deletePlan = [];

  let query = db
    .collectionGroup("observations")
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  let lastDoc = null;
  let scanned = 0;
  let lastLogged = 0;

  for (;;) {
    const page = lastDoc ? query.startAfter(lastDoc) : query;
    const snap = await page.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const dead = fieldsToDelete(doc.data(), DEAD_FIELDS);
      if (dead.length > 0) deletePlan.push({ ref: doc.ref, fields: dead });
      scanned += 1;
      if (limit && scanned >= limit) return { scanned, deletePlan };
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (scanned - lastLogged >= 10000) {
      console.log(`  ...scanned ${scanned} docs`);
      lastLogged = scanned;
    }
    if (snap.size < PAGE_SIZE) break;
  }

  return { scanned, deletePlan };
}

function report(scanned, deletePlan) {
  console.log("\n=== Dead-field delete plan ===");
  const perField = {};
  for (const entry of deletePlan) {
    for (const f of entry.fields) perField[f] = (perField[f] || 0) + 1;
  }
  console.log(`Docs needing cleanup: ${deletePlan.length} of ${scanned}`);
  printCounts("Deletions per field:", perField);
  for (const entry of deletePlan.slice(0, SAMPLE_PATHS)) {
    console.log(`  ${entry.ref.path} -> delete [${entry.fields.join(", ")}]`);
  }
  if (deletePlan.length > SAMPLE_PATHS) {
    console.log(`  ...and ${deletePlan.length - SAMPLE_PATHS} more`);
  }
}

async function applyDeletes(deletePlan) {
  let applied = 0;
  for (let i = 0; i < deletePlan.length; i += DELETE_BATCH_SIZE) {
    const chunk = deletePlan.slice(i, i + DELETE_BATCH_SIZE);
    const batch = db.batch();
    for (const { ref, fields } of chunk) {
      const update = {};
      for (const f of fields) update[f] = FieldValue.delete();
      batch.update(ref, update);
    }
    await batch.commit();
    applied += chunk.length;
    console.log(`  applied ${applied}/${deletePlan.length}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/ops/observation-field-hygiene.mjs [--limit N] [--yes]");
    process.exit(0);
  }

  console.log(`Mode: ${args.yes ? "APPLY (--yes)" : "DRY-RUN"}`);
  console.log(`Dead fields: ${DEAD_FIELDS.join(", ")}`);
  if (args.limit) console.log(`Scan limited to first ${args.limit} docs (smoke test)`);

  console.log("\nScanning students/*/observations ...");
  const { scanned, deletePlan } = await scan(args.limit);
  report(scanned, deletePlan);

  if (!args.yes) {
    if (deletePlan.length > 0) {
      console.log("\nDRY-RUN complete. No writes performed. Re-run with --yes to apply.");
      // Convention from cleanup-dangling-reports.mjs: exit 2 when dry-run
      // found candidates that would be written.
      process.exit(2);
    }
    console.log("\nDRY-RUN complete. Nothing to do.");
    return;
  }

  if (deletePlan.length === 0) {
    console.log("\nNothing to delete. Done.");
    return;
  }

  console.log(`\nApplying FieldValue.delete() to ${deletePlan.length} docs ...`);
  await applyDeletes(deletePlan);

  if (args.limit) {
    console.log(
      `\nWARNING: writes applied to only the first ${args.limit} scanned docs. ` +
      "A full re-run without --limit is required to complete cleanup.",
    );
  }

  console.log("Done. Re-run without --yes to verify zero remaining.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

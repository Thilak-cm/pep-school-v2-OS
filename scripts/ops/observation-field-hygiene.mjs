/**
 * Observation field hygiene: census + dead-field cleanup (#294).
 *
 * One full scan of students/{sid}/observations serves three issues at once
 * (scanning ~70k docs twice would double the ops/review burden for no gain):
 *  1. #294 - deletes proven-dead fields (DEAD_FIELDS: attendanceStatus,
 *     branchId) from every doc carrying them.
 *  2. #227 - doc-ID shape census proves whether offline-queue uuid-fallback
 *     IDs exist in prod (blocks practice-note doc-ID decision).
 *  3. #295 - field-name frequency census per observation type verifies the
 *     suspected docs-phantom / legacy fields (WATCH_FIELDS) against reality.
 *
 * Read-only by default: always prints the censuses and the delete plan
 * WITHOUT writing. Requires --yes to apply FieldValue.delete() updates.
 * Idempotent and re-runnable (re-run after deploys to catch docs written by
 * stale cached clients).
 *
 * Dry-run output identifies doc paths and field NAMES only - no field values
 * are printed (Firestore mutation script convention, see CLAUDE.md).
 *
 * Usage:
 *   node scripts/ops/observation-field-hygiene.mjs                 # dry-run
 *   node scripts/ops/observation-field-hygiene.mjs --limit 500     # smoke test
 *   node scripts/ops/observation-field-hygiene.mjs --yes           # apply
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import {
  DEAD_FIELDS,
  WATCH_FIELDS,
  createCensus,
  recordDoc,
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
    else if (arg === "--limit") args.limit = Number(argv[++i]) || null;
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
  const census = createCensus();
  /** @type {Array<{ref: FirebaseFirestore.DocumentReference, fields: string[]}>} */
  const deletePlan = [];

  let query = db
    .collectionGroup("observations")
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  let lastDoc = null;
  let scanned = 0;

  for (;;) {
    const page = lastDoc ? query.startAfter(lastDoc) : query;
    const snap = await page.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      recordDoc(census, {
        id: doc.id,
        type: data.type,
        fieldNames: Object.keys(data),
      });
      const dead = fieldsToDelete(data, DEAD_FIELDS);
      if (dead.length > 0) deletePlan.push({ ref: doc.ref, fields: dead });
      scanned += 1;
      if (limit && scanned >= limit) return { census, deletePlan };
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (scanned % 10000 < PAGE_SIZE) {
      console.log(`  ...scanned ${scanned} docs`);
    }
    if (snap.size < PAGE_SIZE) break;
  }

  return { census, deletePlan };
}

function report(census, deletePlan) {
  console.log("\n=== Doc-ID shape census (#227) ===");
  printCounts("ID shapes:", census.idShapes);

  console.log("\n=== Observation type counts ===");
  printCounts("Types:", census.typeCounts);

  console.log("\n=== Field census per type (#295) ===");
  for (const [type, fields] of Object.entries(census.fieldCensus)) {
    printCounts(`type=${type} (${census.typeCounts[type]} docs):`, fields);
  }

  console.log("\n=== Watch fields (#295 suspects) ===");
  for (const field of WATCH_FIELDS) {
    let total = 0;
    for (const fields of Object.values(census.fieldCensus)) {
      total += fields[field] || 0;
    }
    console.log(`  ${field.padEnd(32)} ${total}`);
  }

  console.log("\n=== Dead-field delete plan ===");
  const perField = {};
  for (const entry of deletePlan) {
    for (const f of entry.fields) perField[f] = (perField[f] || 0) + 1;
  }
  console.log(`Docs needing cleanup: ${deletePlan.length} of ${census.total}`);
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
  const { census, deletePlan } = await scan(args.limit);
  report(census, deletePlan);

  if (!args.yes) {
    console.log("\nDRY-RUN complete. No writes performed. Re-run with --yes to apply.");
    return;
  }

  if (deletePlan.length === 0) {
    console.log("\nNothing to delete. Done.");
    return;
  }

  console.log(`\nApplying FieldValue.delete() to ${deletePlan.length} docs ...`);
  await applyDeletes(deletePlan);
  console.log("Done. Re-run without --yes to verify zero remaining.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

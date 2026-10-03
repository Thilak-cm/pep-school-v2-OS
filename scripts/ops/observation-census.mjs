/**
 * Read-only observation census: doc-ID shapes, type counts, field frequency.
 *
 * Pure read - no writes, no --yes flag, safe to run any time.
 *
 *  - #227: doc-ID shape census proves whether offline-queue fallback IDs
 *    (obs_sq_*, lesson_sq_*, media_sq_*) exist in prod.
 *  - #295: field-name frequency per observation type verifies suspected
 *    legacy/phantom fields against reality.
 *
 * Usage:
 *   node scripts/ops/observation-census.mjs              # full scan
 *   node scripts/ops/observation-census.mjs --limit 500  # smoke test
 */

import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import {
  WATCH_FIELDS,
  createCensus,
  recordDoc,
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
const { FieldPath } = admin.firestore;

const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = { limit: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        console.error(`--limit requires a positive integer, got: ${raw}`);
        process.exit(1);
      }
      args.limit = n;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/ops/observation-census.mjs [--limit N]");
      process.exit(0);
    } else {
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
      const data = doc.data();
      recordDoc(census, {
        id: doc.id,
        type: data.type,
        fieldNames: Object.keys(data),
      });
      scanned += 1;
      if (limit && scanned >= limit) return census;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (scanned - lastLogged >= 10000) {
      console.log(`  ...scanned ${scanned} docs`);
      lastLogged = scanned;
    }
    if (snap.size < PAGE_SIZE) break;
  }

  return census;
}

function report(census) {
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

  console.log(`\nTotal: ${census.total} docs scanned.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.limit) console.log(`Scan limited to first ${args.limit} docs`);
  console.log("Scanning students/*/observations ...");

  const census = await scan(args.limit);
  report(census);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

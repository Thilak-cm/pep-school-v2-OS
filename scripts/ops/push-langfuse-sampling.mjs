#!/usr/bin/env node
/**
 * push-langfuse-sampling - seeds/updates Firestore config/langfuse_sampling (#298).
 *
 * Usage:
 *   node scripts/ops/push-langfuse-sampling.mjs          # dry-run (default)
 *   node scripts/ops/push-langfuse-sampling.mjs --yes    # apply writes
 *
 * The doc drives value-weighted tail sampling in functions/shared/langfuse.js:
 * { rates: { [featureId]: 0..1 } }. Missing doc/key = 1.0 (keep everything).
 * Only tier-1 featureIds respond to rates - see langfuse.js docblock.
 */

import admin from "firebase-admin";

import {
  DESIRED_RATES,
  validateRates,
  diffRates,
  formatRatesDiff,
} from "./push-langfuse-sampling.helpers.mjs";

const FIRESTORE_DOC = "config/langfuse_sampling";

const applyWrites = process.argv.includes("--yes");

async function main() {
  console.log("\n=== push-langfuse-sampling (#298) ===\n");

  const errors = validateRates(DESIRED_RATES);
  if (errors.length) {
    console.error("Validation errors:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  admin.initializeApp({ projectId: "pep-os" });
  const db = admin.firestore();

  console.log(`Fetching remote ${FIRESTORE_DOC}...`);
  const snap = await db.doc(FIRESTORE_DOC).get();
  const remote = snap.exists ? snap.data() : null;
  console.log(remote ? "  (document exists)\n" : "  (document does not exist yet - will create)\n");

  const diff = diffRates(DESIRED_RATES, remote);
  console.log(`Diff for ${FIRESTORE_DOC} (field: rates):`);
  console.log(formatRatesDiff(diff, DESIRED_RATES, remote));
  console.log();

  const hasChanges = diff.added.length || diff.changed.length || diff.removed.length;
  if (!hasChanges) {
    console.log("No changes to apply. Sampling config is in sync.");
    process.exit(0);
  }

  if (!applyWrites) {
    console.log("DRY RUN: No changes applied. Run with --yes to write to Firestore.");
    process.exit(0);
  }

  console.log("Writing to Firestore...");
  await db.doc(FIRESTORE_DOC).set({
    rates: DESIRED_RATES,
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    _updatedBy: "push-langfuse-sampling.mjs (#298)",
  });
  console.log(`  Written to ${FIRESTORE_DOC}`);
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

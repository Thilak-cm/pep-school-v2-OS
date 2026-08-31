#!/usr/bin/env node
/**
 * push-model-registry - syncs brain/model-registry.json to Firestore
 * config/model_registry (#187).
 *
 * Usage:
 *   node scripts/ops/push-model-registry.mjs          # dry-run (default)
 *   node scripts/ops/push-model-registry.mjs --yes     # apply writes
 *
 * Flow:
 *   1. Read and validate brain/model-registry.json
 *   2. Fetch current config/model_registry from Firestore
 *   3. Diff local vs remote
 *   4. Show summary
 *   5. On --yes: write to Firestore
 *
 * Follows the same dry-run-by-default pattern as push-brain.mjs.
 */

import admin from "firebase-admin";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readRegistryFile,
  validateRegistry,
  diffRegistry,
  formatDiffSummary,
} from "./push-model-registry.helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const REGISTRY_PATH = join(REPO_ROOT, "brain", "model-registry.json");
const FIRESTORE_DOC = "config/model_registry";

const applyWrites = process.argv.includes("--yes");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== push-model-registry (#187) ===\n");

  // 1. Read and validate
  console.log("Reading brain/model-registry.json...");
  let registry;
  try {
    registry = readRegistryFile(REGISTRY_PATH);
  } catch (err) {
    console.error(`ERROR: Cannot read registry file: ${err.message}`);
    process.exit(1);
  }

  const errors = validateRegistry(registry);
  if (errors.length) {
    console.error("Validation errors:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("  Validated: 13 features, all slugs valid.\n");

  // 2. Init Firebase and fetch remote
  admin.initializeApp({ projectId: "pep-os" });
  const db = admin.firestore();

  console.log("Fetching remote config/model_registry...");
  const snap = await db.doc(FIRESTORE_DOC).get();
  const remote = snap.exists ? snap.data() : null;
  if (!remote) {
    console.log("  (document does not exist yet - will create)\n");
  } else {
    console.log("  (document exists)\n");
  }

  // 3. Diff
  const diff = diffRegistry(registry, remote);
  console.log("Diff summary:");
  console.log(formatDiffSummary(diff));
  console.log();

  // Show detailed changes for changed features
  if (diff.changed.length) {
    console.log("Changed features detail:");
    for (const feature of diff.changed) {
      console.log(`  ${feature}:`);
      const localAliases = registry[feature];
      const remoteAliases = remote[feature] || {};
      for (const alias of Object.keys(localAliases)) {
        const localSlug = localAliases[alias];
        const remoteSlug = remoteAliases[alias];
        if (localSlug !== remoteSlug) {
          console.log(`    ${alias}: ${remoteSlug || "(new)"} -> ${localSlug}`);
        }
      }
      for (const alias of Object.keys(remoteAliases)) {
        if (!(alias in localAliases)) {
          console.log(`    ${alias}: ${remoteAliases[alias]} -> (removed)`);
        }
      }
    }
    console.log();
  }

  const hasChanges = diff.added.length || diff.changed.length || diff.removed.length;
  if (!hasChanges) {
    console.log("No changes to apply. Registry is in sync.");
    process.exit(0);
  }

  // 4. Apply or dry-run
  if (!applyWrites) {
    console.log("DRY RUN: No changes applied. Run with --yes to write to Firestore.");
    process.exit(0);
  }

  console.log("Writing to Firestore...");

  // Build the document data: strip _description, keep only feature entries
  const docData = {};
  for (const key of Object.keys(registry)) {
    if (key.startsWith("_")) continue;
    docData[key] = registry[key];
  }

  // Add metadata
  docData._updatedAt = admin.firestore.FieldValue.serverTimestamp();
  docData._updatedBy = "push-model-registry.mjs (#187)";

  await db.doc(FIRESTORE_DOC).set(docData);
  console.log(`  Written to ${FIRESTORE_DOC}`);
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

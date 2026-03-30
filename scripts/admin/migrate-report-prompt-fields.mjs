/**
 * Migration script for PEP-105: Split report system prompt into static/dynamic fields.
 *
 * For each report_{program} doc in ai_prompts:
 *   - Copies `systemPrompt` → `staticSystemPrompt`
 *   - Adds `dynamicSystemPrompt: ""`
 *   - Deletes the legacy `systemPrompt` field
 *
 * Run BEFORE deploying the updated Cloud Functions and frontend.
 *
 * Usage:
 *   node scripts/admin/migrate-report-prompt-fields.mjs
 *   node scripts/admin/migrate-report-prompt-fields.mjs --dry-run
 */
import admin from "firebase-admin";
import { buildMigrationPayload } from "../config/reportMigrationUtils.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const REPORT_PROMPT_DOCS = [
  "report_adolescent",
  "report_elementary",
  "report_primary",
  "report_toddler",
];

const dryRun = process.argv.includes("--dry-run");

async function migrateDoc(docId) {
  const ref = db.collection("ai_prompts").doc(docId);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`  SKIP: ai_prompts/${docId} does not exist`);
    return "skip";
  }

  const data = snap.data();
  const result = buildMigrationPayload(data);

  if (result.status === "skip") {
    const reason = result.reason === "already-migrated"
      ? "already has staticSystemPrompt (already migrated)"
      : "no data";
    console.log(`  SKIP: ai_prompts/${docId} ${reason}`);
    return "skip";
  }

  if (result.warning) {
    console.log(`  WARN: ai_prompts/${docId} ${result.warning}`);
  }

  const updates = {
    ...result.payload,
    systemPrompt: FieldValue.delete(),
    migratedAt: FieldValue.serverTimestamp(),
    migratedFrom: "PEP-105",
  };

  if (dryRun) {
    console.log(`  DRY RUN: ai_prompts/${docId} — would migrate systemPrompt (${(data.systemPrompt || "").length} chars) → staticSystemPrompt`);
    return "dry";
  }

  await ref.update(updates);
  console.log(`  MIGRATED: ai_prompts/${docId} — systemPrompt (${(data.systemPrompt || "").length} chars) → staticSystemPrompt + dynamicSystemPrompt:""`);
  return "migrated";
}

async function main() {
  console.log(`PEP-105: Migrating report prompt fields${dryRun ? " (DRY RUN)" : ""}...\n`);

  const results = {};
  for (const docId of REPORT_PROMPT_DOCS) {
    results[docId] = await migrateDoc(docId);
  }

  const migrated = Object.values(results).filter((r) => r === "migrated").length;
  const skipped = Object.values(results).filter((r) => r === "skip").length;
  const dry = Object.values(results).filter((r) => r === "dry").length;

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}${dryRun ? `, Dry run: ${dry}` : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  });

// PEP-207: Update config/soul_generation systemPrompt in Firestore
// Removes "Areas Needing Further Exploration" narrative section,
// adds area-keyed JSON open_questions instruction.
//
// Usage: node scripts/admin/update-soul-prompt.mjs [--dry-run]

import admin from "firebase-admin";
import { buildSoulSystemPrompt } from "../../functions/utils/soulHelpers.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const docRef = db.collection("config").doc("soul_generation");
  const snap = await docRef.get();

  if (!snap.exists) {
    console.error("config/soul_generation doc not found — cannot update");
    process.exit(1);
  }

  const current = snap.data();
  console.log("Current model:", current.model);
  console.log("Current prompt length:", current.systemPrompt?.length || 0, "chars");

  // Use the updated hardcoded prompt as the new source of truth.
  // The ${guidelinesContent} placeholder is injected at runtime by soul.js,
  // so we pass a placeholder string and then replace it back.
  const PLACEHOLDER = "${guidelinesContent}";
  const newPrompt = buildSoulSystemPrompt(PLACEHOLDER).replace(PLACEHOLDER, () => PLACEHOLDER);

  console.log("\nNew prompt length:", newPrompt.length, "chars");

  // Verify key changes
  const hasOldGaps = newPrompt.includes("Areas Needing Further Exploration");
  const hasAreaJson = newPrompt.includes('"areas"');
  const hasOpenQuestions = newPrompt.includes("```open_questions");

  console.log("\nVerification:");
  console.log("  'Areas Needing Further Exploration' removed:", !hasOldGaps ? "YES" : "NO (PROBLEM)");
  console.log("  Area-keyed JSON format present:", hasAreaJson ? "YES" : "NO (PROBLEM)");
  console.log("  open_questions block present:", hasOpenQuestions ? "YES" : "NO (PROBLEM)");

  if (hasOldGaps) {
    console.error("\nERROR: New prompt still contains 'Areas Needing Further Exploration'");
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would update config/soul_generation.systemPrompt");
    console.log("\n--- NEW PROMPT PREVIEW (first 500 chars) ---");
    console.log(newPrompt.slice(0, 500));
    console.log("...");
    return;
  }

  await docRef.update({
    systemPrompt: newPrompt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("\nUpdated config/soul_generation.systemPrompt successfully.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

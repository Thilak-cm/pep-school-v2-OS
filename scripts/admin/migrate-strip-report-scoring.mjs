/**
 * PEP-68: Strip scoring rubrics from report generation prompts.
 *
 * Removes the "Scoring guidance" section (sentimentScore, areaBalanceScore,
 * missingInputFlags rubrics) from all 4 report prompt docs. Also cleans up
 * inline references to missingInputFlags in domain categorization steps.
 *
 * Scoring is now handled by the separate readiness evaluator prompts
 * (readiness_adolescent, readiness_elementary, etc.).
 *
 * DRY RUN by default — pass --apply to write changes.
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const dryRun = !process.argv.includes("--apply");

const REPORT_DOC_IDS = [
  "report_adolescent",
  "report_elementary",
  "report_primary",
  "report_toddler",
];

function stripScoringSection(prompt) {
  // Remove the "Scoring guidance" section and everything after it
  // All 4 prompts have this pattern: "\nScoring guidance\n" followed by rubrics to the end
  const scoringIndex = prompt.indexOf("\nScoring guidance\n");
  if (scoringIndex === -1) {
    // Try alternate patterns
    const altIndex = prompt.indexOf("Scoring guidance\nsentimentScore");
    if (altIndex === -1) return prompt;
    return prompt.slice(0, altIndex).trimEnd() + "\n";
  }
  return prompt.slice(0, scoringIndex).trimEnd() + "\n";
}

function stripInlineMissingInputFlags(prompt) {
  // Pattern 1: "record it in missingInputFlags. Mention it in the narrative only if..."
  // Replace with just the narrative guidance
  let result = prompt.replace(
    /,?\s*record it in missingInputFlags\.\s*Mention it in the narrative/g,
    ". Mention it in the narrative",
  );

  // Pattern 2: "record it in missingInputFlags. Mention it..." (without "in the narrative")
  result = result.replace(
    /,?\s*record it in missingInputFlags\./g,
    ".",
  );

  // Pattern 3: standalone "record it in missingInputFlags" without period
  result = result.replace(
    /,?\s*record it in missingInputFlags/g,
    "",
  );

  return result;
}

async function migrateDoc(docId) {
  const ref = db.collection("ai_prompts").doc(docId);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log(`  SKIP: ${docId} does not exist`);
    return false;
  }

  const data = snap.data();
  const original = data.staticSystemPrompt || "";

  if (!original) {
    console.log(`  SKIP: ${docId} has empty staticSystemPrompt`);
    return false;
  }

  // Check if scoring section exists
  if (!original.includes("Scoring guidance") && !original.includes("sentimentScore")) {
    console.log(`  SKIP: ${docId} already clean (no scoring section found)`);
    return false;
  }

  let cleaned = stripScoringSection(original);
  cleaned = stripInlineMissingInputFlags(cleaned);

  const originalTokenEstimate = Math.round(original.length / 4);
  const cleanedTokenEstimate = Math.round(cleaned.length / 4);
  const savedTokens = originalTokenEstimate - cleanedTokenEstimate;

  console.log(`  ${docId}:`);
  console.log(`    Original: ~${originalTokenEstimate} tokens (${original.length} chars)`);
  console.log(`    Cleaned:  ~${cleanedTokenEstimate} tokens (${cleaned.length} chars)`);
  console.log(`    Saved:    ~${savedTokens} tokens (${original.length - cleaned.length} chars)`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would update staticSystemPrompt and bump version`);
    return true;
  }

  const newVersion = (data.version || 1) + 1;
  await ref.update({
    staticSystemPrompt: cleaned,
    version: newVersion,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: "migration:pep-68-strip-scoring",
  });

  console.log(`    UPDATED to version ${newVersion}`);
  return true;
}

async function main() {
  console.log(`PEP-68: Strip scoring rubrics from report prompts`);
  console.log(`Mode: ${dryRun ? "DRY RUN (pass --apply to write)" : "APPLY"}\n`);

  let updated = 0;
  for (const docId of REPORT_DOC_IDS) {
    const changed = await migrateDoc(docId);
    if (changed) updated++;
  }

  console.log(`\nDone. ${dryRun ? "Would update" : "Updated"}: ${updated}/${REPORT_DOC_IDS.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });

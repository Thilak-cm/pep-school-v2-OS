/**
 * One-off script to fix corrupted open_questions doc for student 2025-ADO-001.
 *
 * The "Self-Regulation & Attention" area at index 0 has a question whose text
 * was spread character-by-character producing {"0":"W","1":"h","2":"a",...}
 * instead of {question:"What patterns...", status:"answered",...}.
 *
 * This script reconstructs the question text from the numeric keys, preserves
 * the non-numeric metadata fields, and writes the corrected entry back.
 *
 * Usage:
 *   node scripts/admin/fix-corrupted-open-questions.mjs          # dry run
 *   node scripts/admin/fix-corrupted-open-questions.mjs --apply  # apply fix
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "pep-os" });
const db = admin.firestore();

const DRY_RUN = !process.argv.includes("--apply");
const STUDENT_ID = "2025-ADO-001";
const AREA_NAME = "Self-Regulation & Attention";
const CORRUPTED_INDEX = 0;

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

  const docRef = db.doc(`students/${STUDENT_ID}/ai_summaries/open_questions`);
  const snap = await docRef.get();

  if (!snap.exists) {
    console.error("open_questions doc not found for", STUDENT_ID);
    process.exit(1);
  }

  const data = snap.data();
  const areas = data.areas;

  if (!areas || !areas[AREA_NAME]) {
    console.error(`Area "${AREA_NAME}" not found in doc`);
    process.exit(1);
  }

  const entry = areas[AREA_NAME][CORRUPTED_INDEX];
  if (!entry) {
    console.error(`No entry at index ${CORRUPTED_INDEX} in "${AREA_NAME}"`);
    process.exit(1);
  }

  console.log("BEFORE (corrupted entry):");
  console.log(JSON.stringify(entry, null, 2));

  // Separate numeric keys (character spread) from metadata keys
  const numericKeys = [];
  const metadataFields = {};

  for (const [key, value] of Object.entries(entry)) {
    if (/^\d+$/.test(key)) {
      numericKeys.push({ index: parseInt(key, 10), char: value });
    } else {
      metadataFields[key] = value;
    }
  }

  if (numericKeys.length === 0) {
    console.log("No numeric keys found - entry may not be corrupted.");
    process.exit(0);
  }

  // Reconstruct question text from sorted numeric keys
  numericKeys.sort((a, b) => a.index - b.index);
  const reconstructedText = numericKeys.map((k) => k.char).join("");

  console.log(`\nReconstructed question (${numericKeys.length} chars):`);
  console.log(reconstructedText);

  // Build the fixed entry
  const fixedEntry = {
    question: reconstructedText,
    ...metadataFields,
  };

  console.log("\nAFTER (fixed entry):");
  console.log(JSON.stringify(fixedEntry, null, 2));

  if (DRY_RUN) {
    console.log("\nDry run - no changes written. Pass --apply to write.");
    process.exit(0);
  }

  // Write the fix
  const updatedQuestions = [...areas[AREA_NAME]];
  updatedQuestions[CORRUPTED_INDEX] = fixedEntry;

  await docRef.update({
    [`areas.${AREA_NAME}`]: updatedQuestions,
  });

  console.log("\nFix applied successfully.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});

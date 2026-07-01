/**
 * update-baseline-prompts.mjs
 *
 * Updates the staticSystemPrompt field on baseline_report_{program} config docs
 * using the local "report prompts/" text files as source of truth.
 *
 * The local files contain both the generation prompt and the judge scoring section.
 * This script strips the "Internal review scoring" section (already in separate
 * baseline_judge_{program} docs) and appends the generation-only output format.
 *
 * Only updates staticSystemPrompt + metadata — does NOT touch model, temperature,
 * max_tokens, or other config fields.
 *
 * Usage:
 *   node scripts/admin/update-baseline-prompts.mjs
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ---------------------------------------------------------------------------
// Resolve repo root
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Output format appended to generation prompts (replaces the combined format
// that included internalReview — judge handles that separately now)
// ---------------------------------------------------------------------------
const GENERATION_OUTPUT_FORMAT = `
Output format
Respond with a JSON object containing only the report text:
{ "reportText": "<the full markdown report>" }
Use ## for section headers in the markdown.
Do not include any text before or after the JSON object.`.trim();

// ---------------------------------------------------------------------------
// Read and strip prompt files
// ---------------------------------------------------------------------------
function readGenerationPrompt(filename, cutLine) {
  const filepath = join(REPO_ROOT, "report prompts", filename);
  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.split("\n");
  // Keep lines up to (but not including) the "Internal review scoring" line
  const trimmed = lines.slice(0, cutLine - 1).join("\n").trimEnd();
  // Append generation-only output format
  const prompt = `${trimmed}\n\n${GENERATION_OUTPUT_FORMAT}`;
  console.log(
    `  Read "${filename}" — ${lines.length} total lines, kept first ${cutLine - 1}, appended output format`
  );
  return prompt;
}

const PROMPTS = [
  {
    docId: "baseline_report_primary",
    prompt: readGenerationPrompt("prim baseline report prompt", 358),
  },
  {
    docId: "baseline_report_toddler",
    prompt: readGenerationPrompt("prim baseline report prompt", 358), // same as primary
  },
  {
    docId: "baseline_report_elementary",
    prompt: readGenerationPrompt("elementary baseline report prompt", 258),
  },
  {
    docId: "baseline_report_adolescent",
    prompt: readGenerationPrompt("adolescent baseline report prompt", 225),
  },
];

// ---------------------------------------------------------------------------
// Readline helper
// ---------------------------------------------------------------------------
function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=== Update baseline report generation prompts ===\n");
  console.log("This script ONLY updates staticSystemPrompt + metadata fields.");
  console.log("Model, temperature, max_tokens, and other config are preserved.\n");

  // Show diff summary
  for (const { docId, prompt } of PROMPTS) {
    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.warn(`  MISSING: config/${docId} — will need full seed, skipping.`);
      continue;
    }
    const existing = snap.data()?.staticSystemPrompt || "";
    console.log(
      `  ${docId}: ${existing.length} chars → ${prompt.length} chars`
    );
  }

  console.log("");
  const ok = await confirm("Proceed with update? (y/N) ");
  if (!ok) {
    console.log("Aborted.");
    process.exit(0);
  }

  for (const { docId, prompt } of PROMPTS) {
    const ref = db.collection("config").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`  SKIP: config/${docId} does not exist.`);
      continue;
    }

    const currentVersion = snap.data()?.version || 1;
    await ref.update({
      staticSystemPrompt: prompt,
      version: currentVersion + 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: {
        uid: "system",
        email: "system@pepschool.com",
        name: "Update Script (baseline prompt refresh)",
      },
    });

    console.log(`  Updated config/${docId} — v${currentVersion} → v${currentVersion + 1}`);
  }

  // -------------------------------------------------------------------------
  // Verify
  // -------------------------------------------------------------------------
  console.log("\n--- Verification ---\n");

  for (const { docId, prompt } of PROMPTS) {
    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.error(`  FAIL: config/${docId} not found.`);
      continue;
    }
    const data = snap.data();
    const storedLen = (data.staticSystemPrompt || "").length;
    const match = storedLen === prompt.length;
    console.log(
      `  ${match ? "OK" : "MISMATCH"}: config/${docId} — ` +
        `prompt=${storedLen} chars (expected ${prompt.length}), ` +
        `model="${data.model}", temp=${data.temperature}, ` +
        `version=${data.version}`
    );
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});

import admin from "firebase-admin";
import { readFileSync } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ---------------------------------------------------------------------------
// Firebase init (same pattern as other admin scripts)
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
// Resolve repo root from script location: scripts/admin/ -> root
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Read and truncate prompt files
// Lines are 1-indexed; cutLine is exclusive (the "Internal review scoring"
// line and everything after it is stripped).
// ---------------------------------------------------------------------------
function readPrompt(filename, cutLine) {
  const filepath = join(REPO_ROOT, "report prompts", filename);
  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.split("\n");
  // Keep lines 0..(cutLine-2) i.e. lines 1..(cutLine-1) in 1-indexed
  const trimmed = lines.slice(0, cutLine - 1).join("\n").trimEnd();
  console.log(
    `  Read "${filename}" — ${lines.length} total lines, kept first ${cutLine - 1}`
  );
  return trimmed;
}

const PRIMARY_PROMPT = readPrompt("prim baseline report prompt", 358);
const ELEMENTARY_PROMPT = readPrompt("elementary baseline report prompt", 258);
const ADOLESCENT_PROMPT = readPrompt("adolescent baseline report prompt", 225);

// ---------------------------------------------------------------------------
// Doc definitions
// ---------------------------------------------------------------------------
const DOCS = [
  {
    docId: "baseline_report_primary",
    title: "Baseline Report - Primary",
    description: "Settling-in baseline report for primary program students",
    prompt: PRIMARY_PROMPT,
  },
  {
    docId: "baseline_report_toddler",
    title: "Baseline Report - Toddler",
    description: "Settling-in baseline report for toddler program students",
    prompt: PRIMARY_PROMPT, // Same prompt as primary
  },
  {
    docId: "baseline_report_elementary",
    title: "Baseline Report - Elementary",
    description: "Settling-in baseline report for elementary program students",
    prompt: ELEMENTARY_PROMPT,
  },
  {
    docId: "baseline_report_adolescent",
    title: "Baseline Report - Adolescent",
    description: "Settling-in baseline report for adolescent program students",
    prompt: ADOLESCENT_PROMPT,
  },
];

// ---------------------------------------------------------------------------
// Readline helper for confirmation
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
// Seed
// ---------------------------------------------------------------------------
async function seed() {
  console.log("\n--- Seeding baseline report configs ---\n");

  for (const { docId, title, description, prompt } of DOCS) {
    const ref = db.collection("config").doc(docId);
    const existing = await ref.get();

    if (existing.exists) {
      console.warn(`\n  WARNING: config/${docId} already exists.`);
      const ok = await confirm(`  Overwrite config/${docId}? (y/N) `);
      if (!ok) {
        console.log(`  Skipped ${docId}.`);
        continue;
      }
    }

    await ref.set({
      staticSystemPrompt: prompt,
      dynamicSystemPrompt: "",
      model: "openai/gpt-4.1",
      temperature: 0.7,
      max_tokens: 4096,
      timezone: "Asia/Kolkata",
      title,
      description,
      version: 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: {
        uid: "system",
        email: "system@pepschool.com",
        name: "Seed Script",
      },
      versions: [],
    });

    console.log(`  Seeded config/${docId} — "${title}"`);
  }

  // -------------------------------------------------------------------------
  // Verify by reading back
  // -------------------------------------------------------------------------
  console.log("\n--- Verification ---\n");

  for (const { docId } of DOCS) {
    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.error(`  FAIL: config/${docId} not found after seeding.`);
      continue;
    }
    const data = snap.data();
    const promptLen = (data.staticSystemPrompt || "").length;
    console.log(
      `  OK: config/${docId} — ` +
        `title="${data.title}", ` +
        `model="${data.model}", ` +
        `prompt=${promptLen} chars, ` +
        `version=${data.version}`
    );
  }

  console.log("\nDone.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

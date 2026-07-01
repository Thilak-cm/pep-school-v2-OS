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
// Read scoring sections for judge prompts
// Lines are 1-indexed; scoreLine is the "Internal review scoring" line.
// Extracts from scoreLine to end, strips the original "Output format" section,
// and wraps with judge preamble + judge-specific output format.
// ---------------------------------------------------------------------------
const JUDGE_PREAMBLE =
  "You are an independent reviewer evaluating a baseline report written by another AI. " +
  "You will be given the original student observations and the generated report text. " +
  "Score the report independently — do not inflate scores because the report sounds warm.";

const JUDGE_OUTPUT_FORMAT = `Output format
Output only valid JSON in exactly this format:
{
"sentimentScore": <number from 1 to 5>,
"sentimentLabel": "<label>",
"areaBalanceScore": <number from 1 to 5>,
"areaBalanceLabel": "<label>",
"missingInputFlags": [],
"scoreRationale": {
"sentiment": "<1-2 sentences>",
"areaBalance": "<1-2 sentences>"
}
}
Do not include any text before or after the JSON object.`;

function readJudgePrompt(filename, scoreLine) {
  const filepath = join(REPO_ROOT, "report prompts", filename);
  const raw = readFileSync(filepath, "utf-8");
  const lines = raw.split("\n");
  // Extract from scoreLine (1-indexed) to end
  const scoringSection = lines.slice(scoreLine - 1).join("\n").trimEnd();
  // Strip everything from "Output format" onward (the generator's output section)
  const outputIdx = scoringSection.indexOf("\nOutput format");
  const withoutOutput =
    outputIdx !== -1
      ? scoringSection.slice(0, outputIdx).trimEnd()
      : scoringSection;
  // Combine: preamble + scoring criteria + judge output format
  const judgePrompt = `${JUDGE_PREAMBLE}\n\n${withoutOutput}\n\n${JUDGE_OUTPUT_FORMAT}`;
  console.log(
    `  Read judge section from "${filename}" — scoring from line ${scoreLine}`
  );
  return judgePrompt;
}

const PRIMARY_JUDGE_PROMPT = readJudgePrompt(
  "prim baseline report prompt",
  358
);
const ELEMENTARY_JUDGE_PROMPT = readJudgePrompt(
  "elementary baseline report prompt",
  258
);
const ADOLESCENT_JUDGE_PROMPT = readJudgePrompt(
  "adolescent baseline report prompt",
  225
);

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
// Judge doc definitions
// ---------------------------------------------------------------------------
const JUDGE_DOCS = [
  {
    docId: "baseline_judge_primary",
    title: "Baseline Report Judge - Primary",
    description: "Independent scoring for baseline reports - primary",
    prompt: PRIMARY_JUDGE_PROMPT,
  },
  {
    docId: "baseline_judge_toddler",
    title: "Baseline Report Judge - Toddler",
    description: "Independent scoring for baseline reports - toddler",
    prompt: PRIMARY_JUDGE_PROMPT, // Same prompt as primary
  },
  {
    docId: "baseline_judge_elementary",
    title: "Baseline Report Judge - Elementary",
    description: "Independent scoring for baseline reports - elementary",
    prompt: ELEMENTARY_JUDGE_PROMPT,
  },
  {
    docId: "baseline_judge_adolescent",
    title: "Baseline Report Judge - Adolescent",
    description: "Independent scoring for baseline reports - adolescent",
    prompt: ADOLESCENT_JUDGE_PROMPT,
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
  // Seed judge docs
  // -------------------------------------------------------------------------
  console.log("\n--- Seeding baseline judge configs ---\n");

  for (const { docId, title, description, prompt } of JUDGE_DOCS) {
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
      systemPrompt: prompt,
      model: "openai/gpt-4.1-mini",
      temperature: 0.3,
      max_tokens: 1024,
      title,
      description,
      version: 1,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: {
        uid: "system",
        email: "system@pepschool.com",
        name: "Seed Script",
      },
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

  for (const { docId } of JUDGE_DOCS) {
    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.error(`  FAIL: config/${docId} not found after seeding.`);
      continue;
    }
    const data = snap.data();
    const promptLen = (data.systemPrompt || "").length;
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

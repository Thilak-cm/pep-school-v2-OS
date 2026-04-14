/**
 * PEP-139: Migrate ai_prompts docs into config collection.
 *
 * Consolidates all AI feature configuration into config/{featureId} docs,
 * merging prompt content with model/temperature params from code constants.
 *
 * Usage:
 *   node scripts/admin/migrate-ai-prompts-to-config.mjs            # dry-run (default)
 *   node scripts/admin/migrate-ai-prompts-to-config.mjs --apply     # write to Firestore
 *   node scripts/admin/migrate-ai-prompts-to-config.mjs --verify    # check config docs exist with expected fields
 */

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const MODE = process.argv.includes("--verify")
  ? "verify"
  : process.argv.includes("--apply")
    ? "apply"
    : "dry-run";

// --- Model defaults (from functions/config/*Constants.js) ---

const FRONTIER_MODEL = "gpt-5.4";
const MINI_MODEL = "gpt-5.4-mini";

const MODEL_DEFAULTS = {
  text_summarizer: { model: MINI_MODEL, temperature: 0, max_tokens: 1000 },
  voice_transcriber: null, // Whisper API — no chat model
  coach: { model: FRONTIER_MODEL, temperature: 0, max_tokens: 1000 },
  baseball_card: { model: MINI_MODEL, temperature: 0, max_tokens: 1000, windowDays: 42, timezone: "Asia/Kolkata" },
  report: { model: FRONTIER_MODEL, temperature: 0.4, max_tokens: 4096, timezone: "Asia/Kolkata" },
  readiness: { model: MINI_MODEL, temperature: 0.3, max_tokens: 1024 },
  profile: { model: FRONTIER_MODEL, temperature: 0, max_tokens: 8000 },
  chat: null, // already has model/temp in doc
  photo_analysis_vlm: { model: MINI_MODEL, temperature: 0.2, max_tokens: 1000 },
};

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

// --- Migration definitions ---

function buildMigrations() {
  const migrations = [];

  // 1. Simple moves: copy all fields from ai_prompts → config, add model/temp
  const simpleMoves = [
    { docId: "text_summarizer", defaults: MODEL_DEFAULTS.text_summarizer },
    { docId: "voice_transcriber", defaults: MODEL_DEFAULTS.voice_transcriber },
    { docId: "photo_analysis_vlm", defaults: MODEL_DEFAULTS.photo_analysis_vlm },
  ];

  for (const { docId, defaults } of simpleMoves) {
    migrations.push({
      type: "simple_move",
      docId,
      source: `ai_prompts/${docId}`,
      target: `config/${docId}`,
      defaults,
    });
  }

  // Program-dependent simple moves: coach, readiness
  for (const prog of PROGRAMS) {
    migrations.push({
      type: "simple_move",
      docId: `coach_${prog}`,
      source: `ai_prompts/coach_${prog}`,
      target: `config/coach_${prog}`,
      defaults: MODEL_DEFAULTS.coach,
    });
    migrations.push({
      type: "simple_move",
      docId: `readiness_${prog}`,
      source: `ai_prompts/readiness_${prog}`,
      target: `config/readiness_${prog}`,
      defaults: MODEL_DEFAULTS.readiness,
    });
  }

  // 2. Chat copies: move as-is (already have model/temp)
  for (const prog of PROGRAMS) {
    migrations.push({
      type: "chat_copy",
      docId: `chat_${prog}`,
      source: `ai_prompts/chat_${prog}`,
      target: `config/chat_${prog}`,
    });
  }

  // 3. Merges

  // Baseball card: merge ai_prompts/baseball_card + config/baseball_card
  migrations.push({
    type: "merge_baseball_card",
    docId: "baseball_card",
    promptSource: "ai_prompts/baseball_card",
    configSource: "config/baseball_card",
    target: "config/baseball_card",
    modelOverride: MINI_MODEL, // update from stale gpt-4o-mini
  });

  // Reports: merge ai_prompts/report_{prog} + config/report_generation
  for (const prog of PROGRAMS) {
    migrations.push({
      type: "merge_report",
      docId: `report_${prog}`,
      promptSource: `ai_prompts/report_${prog}`,
      configSource: "config/report_generation",
      target: `config/report_${prog}`,
      defaults: MODEL_DEFAULTS.report,
    });
  }

  // Profiles: merge ai_prompts/profile_{prog} + config/profile_dimensions_{prog}
  for (const prog of PROGRAMS) {
    migrations.push({
      type: "merge_profile",
      docId: `profile_${prog}`,
      promptSource: `ai_prompts/profile_${prog}`,
      dimensionsSource: `config/profile_dimensions_${prog}`,
      target: `config/profile_${prog}`,
      defaults: MODEL_DEFAULTS.profile,
    });
  }

  return migrations;
}

// --- Helpers ---

function parseRef(path) {
  const parts = path.split("/");
  return db.collection(parts[0]).doc(parts[1]);
}

async function readDoc(path) {
  const snap = await parseRef(path).get();
  if (!snap.exists) {
    console.warn(`  ⚠ ${path} does not exist — skipping`);
    return null;
  }
  return snap.data();
}

function serializeTimestamps(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toDate === "function") {
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// --- Executors ---

async function executeSimpleMove(m) {
  const sourceData = await readDoc(m.source);
  if (!sourceData) return false;

  const merged = {
    ...serializeTimestamps(sourceData),
    ...(m.defaults || {}),
    _migratedFrom: "ai_prompts",
  };

  if (MODE === "apply") {
    await parseRef(m.target).set({
      ...sourceData,
      ...(m.defaults || {}),
      _migratedFrom: "ai_prompts",
      _migratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const fieldCount = Object.keys(merged).length;
  const addedFields = m.defaults ? Object.keys(m.defaults).join(", ") : "none";
  console.log(`  Fields: ${fieldCount} | Added: ${addedFields}`);
  return true;
}

async function executeChatCopy(m) {
  const sourceData = await readDoc(m.source);
  if (!sourceData) return false;

  if (MODE === "apply") {
    await parseRef(m.target).set({
      ...sourceData,
      _migratedFrom: "ai_prompts",
      _migratedAt: FieldValue.serverTimestamp(),
    });
  }

  const fieldCount = Object.keys(sourceData).length;
  console.log(`  Fields: ${fieldCount} | model: ${sourceData.model || "not set"}`);
  return true;
}

async function executeMergeBaseballCard(m) {
  const promptData = await readDoc(m.promptSource);
  const configData = await readDoc(m.configSource);
  if (!promptData && !configData) return false;

  // Start with existing config, overlay prompt fields, update model
  const merged = {
    ...(configData ? serializeTimestamps(configData) : {}),
    ...(promptData ? serializeTimestamps(promptData) : {}),
    model: m.modelOverride,
    _migratedFrom: "ai_prompts",
  };

  if (MODE === "apply") {
    await parseRef(m.target).set({
      ...(configData || {}),
      ...(promptData || {}),
      model: m.modelOverride,
      _migratedFrom: "ai_prompts",
      _migratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const fieldCount = Object.keys(merged).length;
  const oldModel = configData?.model || "unknown";
  console.log(`  Fields: ${fieldCount} | model: ${oldModel} → ${m.modelOverride}`);
  return true;
}

async function executeMergeReport(m) {
  const promptData = await readDoc(m.promptSource);
  const configData = await readDoc(m.configSource);
  if (!promptData) return false;

  // Prompt fields take priority, then config values, then defaults
  const merged = {
    ...serializeTimestamps(promptData),
    model: configData?.model || m.defaults.model,
    temperature: typeof configData?.temperature === "number" ? configData.temperature : m.defaults.temperature,
    max_tokens: typeof configData?.max_tokens === "number" ? configData.max_tokens : m.defaults.max_tokens,
    timezone: configData?.timezone || m.defaults.timezone,
    _migratedFrom: "ai_prompts",
  };

  if (MODE === "apply") {
    await parseRef(m.target).set({
      ...promptData,
      model: merged.model,
      temperature: merged.temperature,
      max_tokens: merged.max_tokens,
      timezone: merged.timezone,
      _migratedFrom: "ai_prompts",
      _migratedAt: FieldValue.serverTimestamp(),
    });
  }

  const fieldCount = Object.keys(merged).length;
  console.log(`  Fields: ${fieldCount} | model: ${merged.model}, temp: ${merged.temperature}`);
  return true;
}

async function executeMergeProfile(m) {
  const promptData = await readDoc(m.promptSource);
  const dimData = await readDoc(m.dimensionsSource);
  if (!promptData) return false;

  const merged = {
    ...serializeTimestamps(promptData),
    ...(dimData ? { dimensions: dimData.dimensions, programId: dimData.programId } : {}),
    ...m.defaults,
    _migratedFrom: "ai_prompts",
  };

  if (MODE === "apply") {
    await parseRef(m.target).set({
      ...promptData,
      ...(dimData ? { dimensions: dimData.dimensions, programId: dimData.programId } : {}),
      ...m.defaults,
      _migratedFrom: "ai_prompts",
      _migratedAt: FieldValue.serverTimestamp(),
    });
  }

  const fieldCount = Object.keys(merged).length;
  const hasDims = dimData?.dimensions ? `${dimData.dimensions.length} dimensions` : "no dimensions doc";
  console.log(`  Fields: ${fieldCount} | ${hasDims} | model: ${m.defaults.model}`);
  return true;
}

// --- Verify mode ---

const EXPECTED_FIELDS = {
  text_summarizer: ["systemPrompt", "userPrompt", "model", "temperature"],
  voice_transcriber: ["contextPrompt"],
  photo_analysis_vlm: ["systemPrompt", "model", "temperature"],
};

// Add program-dependent expected fields
for (const prog of PROGRAMS) {
  EXPECTED_FIELDS[`coach_${prog}`] = ["nudgeBlocks", "enabledNudges", "model", "temperature"];
  EXPECTED_FIELDS[`chat_${prog}`] = ["systemPrompt", "model", "temperature", "max_tokens"];
  EXPECTED_FIELDS[`readiness_${prog}`] = ["staticSystemPrompt", "model", "temperature"];
  EXPECTED_FIELDS[`report_${prog}`] = ["staticSystemPrompt", "model", "temperature", "max_tokens", "timezone"];
  EXPECTED_FIELDS[`profile_${prog}`] = ["staticSystemPrompt", "model", "temperature"];
}
EXPECTED_FIELDS["baseball_card"] = ["systemPrompt", "model", "temperature", "windowDays", "max_tokens"];

async function verify() {
  console.log("\n=== Verify mode: checking config docs ===\n");
  let pass = 0;
  let fail = 0;

  for (const [docId, requiredFields] of Object.entries(EXPECTED_FIELDS)) {
    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      console.log(`FAIL  config/${docId} — does not exist`);
      fail++;
      continue;
    }

    const data = snap.data();
    const missing = requiredFields.filter((f) => data[f] === undefined || data[f] === null);
    if (missing.length > 0) {
      console.log(`FAIL  config/${docId} — missing fields: ${missing.join(", ")}`);
      fail++;
    } else {
      const model = data.model || "(n/a)";
      console.log(`PASS  config/${docId} — ${Object.keys(data).length} fields, model: ${model}`);
      pass++;
    }
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed out of ${pass + fail} docs ===`);
  if (fail > 0) process.exit(1);
}

// --- Main ---

async function main() {
  if (MODE === "verify") {
    await verify();
    return;
  }

  const migrations = buildMigrations();
  console.log(`\n=== PEP-139 Migration (${MODE}) — ${migrations.length} operations ===\n`);

  let success = 0;
  let skipped = 0;

  for (const m of migrations) {
    console.log(`[${m.type}] ${m.source || m.promptSource} → ${m.target}`);

    let ok = false;
    switch (m.type) {
      case "simple_move":
        ok = await executeSimpleMove(m);
        break;
      case "chat_copy":
        ok = await executeChatCopy(m);
        break;
      case "merge_baseball_card":
        ok = await executeMergeBaseballCard(m);
        break;
      case "merge_report":
        ok = await executeMergeReport(m);
        break;
      case "merge_profile":
        ok = await executeMergeProfile(m);
        break;
      default:
        console.warn(`  ⚠ Unknown migration type: ${m.type}`);
    }

    if (ok) success++;
    else skipped++;
  }

  console.log(`\n=== Done: ${success} migrated, ${skipped} skipped ===`);
  if (MODE === "dry-run") {
    console.log("(dry-run — no writes performed. Use --apply to write.)");
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

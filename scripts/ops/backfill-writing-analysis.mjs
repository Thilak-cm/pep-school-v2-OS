#!/usr/bin/env node
/**
 * Compensatory backfill: writingAnalysis W30-W36 gap (#281).
 *
 * Three phases, run via --phase:
 *   cleanup         - restore 24 lump-processed students to pre-lump state
 *   migrate-history - re-key writing_analysis history doc IDs to ISO week keys
 *   backfill        - process one week per invocation (default)
 *
 * Dry-run by default. --yes to apply writes.
 *
 * Usage:
 *   node scripts/ops/backfill-writing-analysis.mjs [--phase cleanup|migrate-history|backfill] \
 *     [--yes] [--verify-only] [--student-ids s1,s2]
 *
 * Secrets auto-loaded from functions/.secret.local (OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY,
 * LANGFUSE_PUBLIC_KEY). Override via env vars if needed.
 */

// ---------------------------------------------------------------------------
// Env preamble - must come before any firebase-admin or functions import
// ---------------------------------------------------------------------------
process.env.GCLOUD_PROJECT = "pep-os";
process.env.GCP_PROJECT = "pep-os";
process.env.GOOGLE_CLOUD_PROJECT = "pep-os";

// Auto-load secrets from functions/.secret.local
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const secretPath = resolve(__dirname, "../../functions/.secret.local");
try {
  const lines = readFileSync(secretPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    // Don't overwrite explicitly set env vars
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // File missing is fine - env vars must be set manually
}

import { parseArgs } from "node:util";
import { db, Timestamp } from "../../functions/shared/firebase.js";
import { runLLM } from "../../functions/shared/llm.js";
import { getWorkItems } from "../../functions/shared/ledger.js";
import { fetchActiveStudentIds } from "../../functions/shared/scheduling.js";
import {
  buildBatchWritingPrompt,
  parseWritingAnalysisResponse,
  calculateAge,
} from "../../functions/utils/handwritingAnalysisHelpers.js";
import { downloadImageAsBase64 } from "../../functions/ai/handwriting.js";
import { getIstIsoWeekKey } from "../../functions/utils/weekKey.js";
import {
  HANDWRITING_ANALYSIS_DEFAULTS,
  HANDWRITING_ANALYSIS_FALLBACK_PROMPT,
  getFallbackPromptForProgram,
} from "../../functions/config/handwritingAnalysisFallbacks.js";
import {
  getSimulatedRunTime,
  filterMediaForWeek,
  deriveHistoryKey,
  planHistoryRekey,
  docsDeepEqual,
  buildBackfillAnalysisDoc,
  nextTargetWeek,
  getBlockedStudents,
  planLumpCleanup,
  verifyWeekReport,
  TARGET_WEEKS,
} from "./backfill-writing-analysis.helpers.mjs";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: flags } = parseArgs({
  options: {
    phase: { type: "string", default: "backfill" },
    yes: { type: "boolean", default: false },
    "verify-only": { type: "boolean", default: false },
    "student-ids": { type: "string" },
  },
  strict: true,
});

const PHASE = flags.phase;
const DRY_RUN = !flags.yes;
const VERIFY_ONLY = flags["verify-only"];
const STUDENT_ID_FILTER = flags["student-ids"]
  ? new Set(flags["student-ids"].split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const CONCURRENCY = 4;
const BATCH_LIMIT = 450; // Firestore batch limit is 500, leave headroom

// ---------------------------------------------------------------------------
// Env checks
// ---------------------------------------------------------------------------

for (const key of ["OPENROUTER_API_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_PUBLIC_KEY"]) {
  if (!process.env[key]) {
    console.error(`ERROR: ${key} env var is required`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// State doc path
// ---------------------------------------------------------------------------

const STATE_DOC_REF = db.collection("jobs").doc("writingAnalysis")
  .collection("backfills").doc("2026-w30-w36");

async function getStateDoc() {
  const snap = await STATE_DOC_REF.get();
  return snap.exists ? snap.data() : null;
}

async function updateStateDoc(updates) {
  await STATE_DOC_REF.set({ ...updates, updatedAt: Timestamp.now() }, { merge: true });
}

// ---------------------------------------------------------------------------
// Duplicated private functions from handwriting.js (module-private, can't import)
// Provenance: functions/ai/handwriting.js:80-109 (fetchUnprocessedHandwriting)
// and functions/ai/handwriting.js:159-192 (buildUserContent).
// Duplicated here because exporting them would touch production code for a one-off script.
// ---------------------------------------------------------------------------

/**
 * Fetch unprocessed handwritten media docs for a student.
 * EXACT same query shape as production (exercises the #221-fix indexes).
 */
async function fetchUnprocessedHandwriting(studentId) {
  const mediaRef = db.collection("students").doc(studentId).collection("observations");
  const snap = await mediaRef
    .where("type", "==", "media")
    .where("handwritten", "==", true)
    .where("status", "==", "ready")
    .orderBy("observedAt", "asc")
    .get();

  const docs = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.batchAnalyzedAt) return;
    const observedAt = d.observedAt?.toDate?.() ?? (d.observedAt ? new Date(d.observedAt) : null);
    if (!observedAt) return;
    docs.push({
      id: doc.id,
      observedAt,
      teacherComment: d.teacherComment || null,
      copied: d.copied === true,
      curriculumArea: d.curriculumArea || null,
      createdByName: d.createdByName || null,
      storagePath: Array.isArray(d.media) && d.media[0]?.storagePath ? d.media[0].storagePath : null,
    });
  });
  return docs;
}

/**
 * Build multimodal user content (text annotations interleaved with base64 images).
 * Provenance: functions/ai/handwriting.js:159-192
 */
async function buildUserContent(mediaDocs, promptText) {
  const userContent = [];
  const promptLines = promptText.split("\n");

  const firstImageIdx = promptLines.findIndex((l) => l.startsWith("[Image "));
  if (firstImageIdx > 0) {
    userContent.push({ type: "text", text: promptLines.slice(0, firstImageIdx).join("\n") });
  }

  let successfulDownloads = 0;
  for (let i = 0; i < mediaDocs.length; i++) {
    const doc = mediaDocs[i];
    const imageHeader = `[Image ${i + 1} of ${mediaDocs.length}`;
    const startIdx = promptLines.findIndex((l) => l.startsWith(imageHeader));
    const nextImageIdx = i < mediaDocs.length - 1
      ? promptLines.findIndex((l, idx) => idx > startIdx && l.startsWith(`[Image ${i + 2}`))
      : promptLines.length;
    const annotationText = promptLines.slice(startIdx, nextImageIdx).join("\n").trim();
    userContent.push({ type: "text", text: annotationText });

    if (doc.storagePath) {
      try {
        const imagePart = await downloadImageAsBase64(doc.storagePath);
        userContent.push(imagePart);
        successfulDownloads++;
      } catch (err) {
        console.warn(`  [download] Failed: ${doc.storagePath}: ${err?.message}`);
        userContent.push({ type: "text", text: `[Image could not be loaded: ${doc.storagePath}]` });
      }
    }
  }
  return { userContent, successfulDownloads };
}

// ---------------------------------------------------------------------------
// Config fetch (duplicated from handwriting.js:42-74 - module-private)
// ---------------------------------------------------------------------------

const configCacheByProgram = {};
const WRITING_CACHE_TTL_MS = 5 * 60 * 1000;

async function getWritingAnalysisConfig(programId) {
  const cacheKey = programId || "_generic";
  if (configCacheByProgram[cacheKey]?.data &&
      (Date.now() - configCacheByProgram[cacheKey].ts < WRITING_CACHE_TTL_MS)) {
    return configCacheByProgram[cacheKey].data;
  }

  const fallbackPrompt = programId
    ? getFallbackPromptForProgram(programId)
    : HANDWRITING_ANALYSIS_FALLBACK_PROMPT;

  try {
    const docId = programId ? `writing_analysis_${programId}` : "writing_analysis_generic";
    const snap = await db.collection("config").doc(docId).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      systemPrompt: String(data.systemPrompt || fallbackPrompt),
      model: data.model || HANDWRITING_ANALYSIS_DEFAULTS.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : HANDWRITING_ANALYSIS_DEFAULTS.temperature,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : HANDWRITING_ANALYSIS_DEFAULTS.max_tokens,
      minSamples: Number.isFinite(data.minSamples) ? data.minSamples : HANDWRITING_ANALYSIS_DEFAULTS.minSamples,
    };
    configCacheByProgram[cacheKey] = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn(`[config] fetch failed for ${cacheKey}, using fallback:`, err?.message);
    const out = { systemPrompt: fallbackPrompt, ...HANDWRITING_ANALYSIS_DEFAULTS };
    configCacheByProgram[cacheKey] = { data: out, ts: Date.now() };
    return out;
  }
}

// ---------------------------------------------------------------------------
// Resolve programId for a student (duplicated from handwriting.js:220-225)
// ---------------------------------------------------------------------------

async function resolveProgramId(studentData) {
  const classroomId = studentData.classroomId;
  if (!classroomId) return null;
  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  return classroomSnap.exists ? (classroomSnap.data()?.programId || null) : null;
}

// ---------------------------------------------------------------------------
// Phase 1: Lump cleanup
// ---------------------------------------------------------------------------

async function runCleanup() {
  console.log("=== Phase 1: Lump cleanup ===");
  console.log(DRY_RUN ? "[DRY RUN]" : "[APPLY]");

  // 1. Identify lump students from W37 ledger
  const workItems = await getWorkItems("writingAnalysis", "2026-W37");
  const successItems = workItems.filter((wi) => wi.state === "success");
  console.log(`W37 ledger: ${workItems.length} total, ${successItems.length} success`);

  if (successItems.length === 0) {
    console.log("No lump-processed students found in W37 ledger. Nothing to clean up.");
    return;
  }

  // 2. Cross-check against live docs
  const lumpStudentIds = successItems.map((wi) => wi.id);
  const mismatches = [];

  for (const studentId of lumpStudentIds) {
    const liveSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis").get();
    if (!liveSnap.exists) {
      mismatches.push(`${studentId}: no live doc`);
      continue;
    }
    const liveData = liveSnap.data();
    if (liveData.periodKey !== "2026-W37") {
      mismatches.push(`${studentId}: live periodKey=${liveData.periodKey}, expected 2026-W37`);
    }
  }

  if (mismatches.length > 0) {
    console.error("ABORT: cross-check mismatch between ledger and live docs:");
    mismatches.forEach((m) => console.error(`  - ${m}`));
    process.exit(1);
  }

  console.log(`Cross-check passed: all ${lumpStudentIds.length} students have periodKey=2026-W37`);

  // 3. Plan and execute per-student cleanup
  let cleaned = 0;
  let errors = 0;

  for (const studentId of lumpStudentIds) {
    try {
      const liveSnap = await db.collection("students").doc(studentId)
        .collection("ai_summaries").doc("writing_analysis").get();
      const combinedDoc = liveSnap.data();

      // Fetch history entries
      const historySnap = await liveSnap.ref.collection("history").get();
      const historyEntries = historySnap.docs.map((d) => ({ id: d.id, data: d.data() }));

      const plan = planLumpCleanup(combinedDoc, historyEntries);

      console.log(`\n${studentId}:`);
      console.log(`  media to un-stamp: ${plan.mediaToUnstamp.length} docs`);
      if (plan.historyEntryToRestore) {
        console.log(`  restore from history: ${plan.historyEntryToRestore.id}`);
      } else {
        console.log(`  first-ever analysis - delete lump doc (no prior to restore)`);
      }

      if (DRY_RUN) {
        plan.mediaToUnstamp.forEach((id) => console.log(`    un-stamp: observations/${id}`));
        cleaned++;
        continue;
      }

      // Apply: batch write
      const batch = db.batch();

      // Un-stamp media: set batchAnalyzedAt to null so fetchUnprocessedHandwriting's
      // `if (d.batchAnalyzedAt) return;` check no longer skips these docs.
      // (null is falsy; FieldValue.delete() is not supported in batch.update())
      for (const mediaId of plan.mediaToUnstamp) {
        const ref = db.collection("students").doc(studentId)
          .collection("observations").doc(mediaId);
        batch.update(ref, { batchAnalyzedAt: null });
      }

      if (plan.historyEntryToRestore) {
        // Restore: overwrite live doc with pre-lump data
        batch.set(liveSnap.ref, plan.historyEntryToRestore.data);
        // Delete the history entry we restored from
        const historyRef = liveSnap.ref.collection("history").doc(plan.historyEntryToRestore.id);
        batch.delete(historyRef);
      } else {
        // First-ever analysis: delete the lump doc entirely
        batch.delete(liveSnap.ref);
      }

      await batch.commit();
      console.log(`  APPLIED`);
      cleaned++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nCleanup complete: ${cleaned} students processed, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Phase 2: History re-key migration
// ---------------------------------------------------------------------------

async function runMigrateHistory() {
  console.log("=== Phase 2: History re-key migration ===");
  console.log(DRY_RUN ? "[DRY RUN]" : "[APPLY]");

  const studentIds = await fetchActiveStudentIds();
  console.log(`Scanning ${studentIds.length} active students for history entries...`);

  let totalRenamed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const studentId of studentIds) {
    const historyRef = db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis").collection("history");
    const historySnap = await historyRef.get();

    if (historySnap.empty) continue;

    const entries = historySnap.docs.map((d) => ({ id: d.id, data: d.data() }));

    let plan;
    try {
      plan = planHistoryRekey(entries);
    } catch (err) {
      console.error(`${studentId}: ${err.message}`);
      totalErrors++;
      continue;
    }

    if (plan.length === 0) {
      totalSkipped++;
      continue;
    }

    for (const { oldId, newId } of plan) {
      console.log(`${studentId}: ${oldId} -> ${newId}`);

      if (DRY_RUN) {
        totalRenamed++;
        continue;
      }

      // Copy
      const oldRef = historyRef.doc(oldId);
      const newRef = historyRef.doc(newId);
      const oldData = entries.find((e) => e.id === oldId).data;
      await newRef.set(oldData);

      // Read-back and verify
      const readBack = await newRef.get();
      if (!readBack.exists || !docsDeepEqual(oldData, readBack.data())) {
        console.error(`  VERIFY FAILED for ${studentId}/${newId} - aborting this student`);
        await newRef.delete();
        totalErrors++;
        break;
      }

      // Delete old
      await oldRef.delete();
      totalRenamed++;
      console.log(`  APPLIED`);
    }
  }

  console.log(`\nMigration complete: ${totalRenamed} renamed, ${totalSkipped} already correct, ${totalErrors} errors`);
}

// ---------------------------------------------------------------------------
// Phase 3: Backfill (one week per invocation)
// ---------------------------------------------------------------------------

async function runBackfill() {
  const stateDoc = await getStateDoc();
  const weekKey = nextTargetWeek(stateDoc);

  if (!weekKey) {
    console.log("All weeks W30-W36 verified. Backfill complete!");
    return;
  }

  console.log(`=== Phase 3: Backfill ${weekKey} ===`);
  console.log(DRY_RUN ? "[DRY RUN]" : "[APPLY]");
  console.log(VERIFY_ONLY ? "[VERIFY ONLY]" : "");

  const cutoff = getSimulatedRunTime(weekKey);
  console.log(`Simulated run time: ${cutoff.toISOString()} (Sunday 00:30 IST)`);

  // Check for blocked students from earlier weeks
  const weekOutcomes = stateDoc?.weekOutcomes || {};
  const blockedStudents = getBlockedStudents(weekOutcomes, weekKey);
  if (blockedStudents.size > 0) {
    console.log(`Blocked students (failed in earlier week): ${[...blockedStudents].join(", ")}`);
  }

  if (VERIFY_ONLY) {
    let outcomes = weekOutcomes[weekKey] || {};
    if (STUDENT_ID_FILTER) {
      outcomes = Object.fromEntries(Object.entries(outcomes).filter(([id]) => STUDENT_ID_FILTER.has(id)));
      console.log(`Verifying ${Object.keys(outcomes).length} filtered student(s)`);
    }
    await runVerifier(weekKey, outcomes);
    return;
  }

  // Fetch active students, sorted by programId for prompt cache locality.
  // System prompts are ~1400-1800 tokens (above OpenAI's 1024-token cache minimum),
  // so grouping same-program students keeps the prefix cached across consecutive calls.
  let studentIds = await fetchActiveStudentIds();
  if (STUDENT_ID_FILTER) {
    studentIds = studentIds.filter((id) => STUDENT_ID_FILTER.has(id));
    console.log(`Filtered to ${studentIds.length} student(s): ${studentIds.join(", ")}`);
  }
  studentIds = studentIds.filter((id) => !blockedStudents.has(id));

  // Resolve programId for each student and sort by it
  const studentPrograms = [];
  for (const studentId of studentIds) {
    const studentSnap = await db.collection("students").doc(studentId).get();
    const programId = studentSnap.exists ? await resolveProgramId(studentSnap.data()) : null;
    studentPrograms.push({ studentId, programId });
  }
  studentPrograms.sort((a, b) => (a.programId || "").localeCompare(b.programId || ""));
  studentIds = studentPrograms.map((s) => s.studentId);
  const programCounts = {};
  for (const { programId } of studentPrograms) {
    programCounts[programId || "unknown"] = (programCounts[programId || "unknown"] || 0) + 1;
  }
  console.log(`Processing ${studentIds.length} students for ${weekKey} (${blockedStudents.size} blocked)`);
  console.log(`Program order: ${Object.entries(programCounts).map(([p, c]) => `${p}(${c})`).join(", ")}`);

  // Capture pre-run generatedAt snapshots for verifier (skipped student mutation check)
  const preRunSnapshots = {};
  for (const studentId of studentIds) {
    const snap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis").get();
    if (snap.exists) {
      const data = snap.data();
      preRunSnapshots[studentId] = data.generatedAt?.toDate?.()?.getTime() ?? null;
    }
  }

  const outcomes = {};
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  const total = studentIds.length;

  // Process students with bounded concurrency
  const queue = [...studentIds];
  const workers = new Array(Math.min(CONCURRENCY, queue.length)).fill(null).map(async () => {
    while (queue.length) {
      const studentId = queue.shift();
      try {
        const result = await processStudentWeek(studentId, weekKey, cutoff);
        outcomes[studentId] = result;
        if (result === "completed") completed++;
        else if (result.startsWith("skipped:")) skipped++;
        else if (result.startsWith("failed:")) failed++;
      } catch (err) {
        console.error(`  ${studentId}: UNEXPECTED ERROR: ${err.message}`);
        outcomes[studentId] = `failed:${err.message.slice(0, 200)}`;
        failed++;
      }
      processed++;
      if (processed % 50 === 0 || processed === total) {
        console.log(`--- ${processed}/${total} | ${completed} done, ${skipped} skip, ${failed} fail ---`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`\n${weekKey} execution: ${completed} completed, ${skipped} skipped, ${failed} failed`);

  if (!DRY_RUN) {
    // Update state doc
    const updatedOutcomes = { ...weekOutcomes, [weekKey]: outcomes };
    const completedWeeks = [...(stateDoc?.completedWeeks || [])];
    if (!completedWeeks.includes(weekKey)) completedWeeks.push(weekKey);
    await updateStateDoc({ completedWeeks, weekOutcomes: updatedOutcomes });
    console.log(`State doc updated: ${weekKey} marked completed`);

    // Auto-verify
    console.log(`\nRunning verifier for ${weekKey}...`);
    await runVerifier(weekKey, outcomes, preRunSnapshots);
  }
}

/**
 * Process a single student for a single week.
 * Returns an outcome string: "completed", "skipped:<reason>", or "failed:<detail>".
 */
async function processStudentWeek(studentId, weekKey, cutoff) {
  // Fetch student data
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) return "skipped:student_not_found";
  const studentData = studentSnap.data();

  const programId = await resolveProgramId(studentData);
  if (!programId) return "skipped:unresolvable_program";

  const config = await getWritingAnalysisConfig(programId);

  // Production-identical query, then in-memory cutoff
  const allUnprocessed = await fetchUnprocessedHandwriting(studentId);
  const mediaDocs = filterMediaForWeek(allUnprocessed, cutoff);

  if (mediaDocs.length < config.minSamples) {
    console.log(`  ${studentId}: ${mediaDocs.length} docs < ${config.minSamples} minSamples -> skip`);
    return `skipped:insufficient_samples(${mediaDocs.length}/${config.minSamples})`;
  }

  console.log(`  ${studentId}: ${mediaDocs.length} docs eligible for ${weekKey}`);

  if (DRY_RUN) return "completed";

  // Read previous analysis for longitudinal context
  const analysisRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis");
  const prevSnap = await analysisRef.get();
  const previousAnalysis = prevSnap.exists ? prevSnap.data() : null;

  // Archive current live doc before overwriting
  if (prevSnap.exists) {
    const prevData = prevSnap.data();
    const archiveKey = deriveHistoryKey(prevData);
    const historyRef = analysisRef.collection("history").doc(archiveKey);
    await historyRef.set({ ...prevData, archivedAt: Timestamp.now() });
  }

  // Build prompt with simulated run time
  const dob = studentData.dateOfBirth?.toDate?.() ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
  const student = { displayName: studentData.displayName || studentId, dateOfBirth: dob };
  const promptText = buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, cutoff);
  const { userContent, successfulDownloads } = await buildUserContent(mediaDocs, promptText);

  if (successfulDownloads < config.minSamples) {
    return `skipped:insufficient_images_loaded(${successfulDownloads}/${config.minSamples})`;
  }

  // VLM call with one retry
  let vlmResult;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const enhancedPrompt = config.systemPrompt.includes("JSON") || config.systemPrompt.includes("json")
        ? config.systemPrompt
        : config.systemPrompt + "\n\nIMPORTANT: You must respond with valid JSON only.";

      const { content: rawContent } = await runLLM({
        featureId: "writing_analysis",
        messages: [
          { role: "system", content: enhancedPrompt },
          { role: "user", content: userContent },
        ],
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        responseFormat: { type: "json_object" },
        traceName: "writing-analysis-backfill",
        traceMetadata: { studentId, weekKey, backfill: true, attempt },
      });

      vlmResult = JSON.parse(rawContent);
      break; // success
    } catch (err) {
      if (attempt === 2) {
        console.error(`  ${studentId}: LLM failed after 2 attempts: ${err.message}`);
        return `failed:llm_error(${err.message.slice(0, 100)})`;
      }
      console.warn(`  ${studentId}: attempt ${attempt} failed, retrying: ${err.message}`);
    }
  }

  const parsed = parseWritingAnalysisResponse(vlmResult);
  if (!parsed) return "failed:parse_error";

  const age = calculateAge(student.dateOfBirth, cutoff);
  const analysisDoc = buildBackfillAnalysisDoc(parsed, {
    mediaDocs,
    studentAge: age,
    model: config.model,
    programId,
    classroomId: studentData.classroomId || null,
    weekKey,
  });

  // Write new doc + stamp media in a batch
  const batch = db.batch();
  // Convert Date to Firestore Timestamp for the doc
  const firestoreDoc = {
    ...analysisDoc,
    generatedAt: Timestamp.fromDate(analysisDoc.generatedAt),
  };
  batch.set(analysisRef, firestoreDoc);

  const docsToMark = mediaDocs.slice(0, BATCH_LIMIT);
  if (mediaDocs.length > BATCH_LIMIT) {
    console.warn(`  ${studentId}: ${mediaDocs.length} media docs exceed batch limit, marking first ${BATCH_LIMIT}`);
  }
  for (const doc of docsToMark) {
    const mediaRef = db.collection("students").doc(studentId)
      .collection("observations").doc(doc.id);
    batch.update(mediaRef, { batchAnalyzedAt: Timestamp.now() });
  }
  await batch.commit();

  console.log(`  ${studentId}: ${weekKey} COMPLETED (${mediaDocs.length} samples)`);
  return "completed";
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

async function runVerifier(weekKey, outcomes, preRunSnapshots = null) {
  const studentIds = Object.keys(outcomes);
  if (studentIds.length === 0) {
    console.log("No outcomes to verify.");
    return;
  }

  // If preRunSnapshots not provided (--verify-only mode), we can't check
  // skipped-student mutation. Use a lenient mode.
  const lenientSkipCheck = !preRunSnapshots;

  // Fetch current state for each student
  const fetchedState = {};
  let verified = 0;
  const verifyTotal = studentIds.length;
  for (const studentId of studentIds) {
    verified++;
    if (verified % 50 === 0 || verified === verifyTotal) {
      console.log(`  verifying ${verified}/${verifyTotal}...`);
    }
    const outcome = outcomes[studentId];
    const analysisRef = db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis");
    const snap = await analysisRef.get();

    if (outcome === "completed") {
      const liveDoc = snap.exists ? snap.data() : null;

      // Check all sourceMediaIds are stamped
      let allMediaStamped = true;
      if (liveDoc?.sourceMediaIds) {
        for (const mediaId of liveDoc.sourceMediaIds) {
          const mediaSnap = await db.collection("students").doc(studentId)
            .collection("observations").doc(mediaId).get();
          if (!mediaSnap.exists || !mediaSnap.data()?.batchAnalyzedAt) {
            allMediaStamped = false;
            break;
          }
        }
      }

      // Check archive of prior week exists.
      // First-ever analyses (no prior doc) have nothing to archive - that's correct.
      const historySnap = await analysisRef.collection("history").get();
      const archivePresent = !historySnap.empty;
      // First-ever analysis = no prior doc existed before this week's backfill.
      // With preRunSnapshots: student absent from snapshots means no doc existed.
      // In --verify-only mode (no snapshots): no history + live doc is the target week = first-ever.
      const firstEverAnalysis = preRunSnapshots
        ? !(studentId in preRunSnapshots)
        : (!archivePresent && liveDoc?.periodKey === weekKey && liveDoc?.backfilled);

      fetchedState[studentId] = {
        liveDoc: liveDoc ? {
          periodKey: liveDoc.periodKey,
          backfilled: liveDoc.backfilled,
          generatedAt: liveDoc.generatedAt?.toDate?.() ?? liveDoc.generatedAt,
          sourceMediaIds: liveDoc.sourceMediaIds,
        } : null,
        allMediaStamped,
        archivePresent,
        firstEverAnalysis,
      };
    } else if (outcome.startsWith("skipped:")) {
      const currentGeneratedAt = snap.exists
        ? (snap.data()?.generatedAt?.toDate?.()?.getTime() ?? null)
        : null;
      const preGeneratedAt = preRunSnapshots?.[studentId] ?? null;

      fetchedState[studentId] = {
        liveDoc: snap.exists ? snap.data() : null,
        generatedAtUnchanged: lenientSkipCheck ? true : (currentGeneratedAt === preGeneratedAt),
      };
    }
  }

  const report = verifyWeekReport(weekKey, outcomes, fetchedState);

  console.log(`\nVerification for ${weekKey}:`);
  console.log(`  Completed: ${report.summary.completed}`);
  console.log(`  Skipped: ${report.summary.skipped}`);
  console.log(`  Failed: ${report.summary.failed}`);

  if (report.pass) {
    console.log(`  RESULT: PASS`);
    // Mark week as verified in state doc
    const stateDoc = await getStateDoc();
    const verifiedWeeks = [...(stateDoc?.verifiedWeeks || [])];
    if (!verifiedWeeks.includes(weekKey)) {
      verifiedWeeks.push(weekKey);
      await updateStateDoc({ verifiedWeeks });
      console.log(`  ${weekKey} added to verifiedWeeks`);
    }
  } else {
    console.log(`  RESULT: FAIL`);
    for (const f of report.failures) {
      console.log(`    ${f.studentId}: ${f.reason}`);
    }
    console.log(`\n  Fix failures and re-run. Week ${weekKey} will not advance until clean.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nwritingAnalysis backfill (#281)`);
  console.log(`Phase: ${PHASE} | ${DRY_RUN ? "DRY RUN" : "APPLY"} | ${VERIFY_ONLY ? "VERIFY ONLY" : ""}`);
  if (STUDENT_ID_FILTER) console.log(`Student filter: ${[...STUDENT_ID_FILTER].join(", ")}`);
  console.log("");

  switch (PHASE) {
    case "cleanup":
      await runCleanup();
      break;
    case "migrate-history":
      await runMigrateHistory();
      break;
    case "backfill":
      await runBackfill();
      break;
    default:
      console.error(`Unknown phase: ${PHASE}. Use: cleanup, migrate-history, or backfill`);
      process.exit(1);
  }

  // Graceful shutdown - Langfuse client may have pending flushes
  await new Promise((resolve) => setTimeout(resolve, 2000));
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

import * as functions from "firebase-functions/v1";
import { db, Timestamp } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_API_KEY, getOpenRouterKey, OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import {
  SOUL_DEFAULTS,
  VALID_PROGRAMS,
  buildSoulSystemPrompt,
  buildSoulUserPrompt,
  injectGuidelinesContent,
  parseSoulResponse,
  buildSoulDoc,
  buildGuidelinesDoc,
  buildOpenQuestionsDoc,
  buildOpenQuestionsHistorySnapshot,
  buildHistorySnapshot,
  hasEmergentObservations,
  extractGuidelinesSuggestions,
  extractOpenQuestions,
} from "../utils/soulHelpers.js";
import { formatInterviewForPrompt } from "../utils/interviewHelpers.js";
import {
  getStudentWithProgram,
  fetchStudentNotesForWindow,
  fetchStudentInterviews,
  formatObservationForPrompt,
  chooseObservationTimestamp,
} from "../shared/studentHelpers.js";
import { fetchActiveStudentIds } from "../shared/scheduling.js";
import { PubSub } from "@google-cloud/pubsub";
import { chunkStudentIds, parseSoulWorkerMessage } from "./soulFanout.js";
import {
  computeExecutionId,
  createExecution,
  seedWorkItems,
  updateWorkItem,
  buildWorkItemUpdate,
  markExecutionFailed,
  classifyError,
} from "../shared/ledger.js";

// -----------------------------------------------
// Student Soul: Generate soul narrative for a single student (PEP-149)
// Replaces the old per-dimension profile system (PEP-124)
// -----------------------------------------------

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

const SOUL_TOPIC = "soul-workers";
const pubsub = new PubSub();
const soulTopic = pubsub.topic(SOUL_TOPIC);

const SOUL_TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let soulTemplateCache = {};
// Missing-doc results (null) are cached for TTL to avoid Firestore hammering.
// If config docs are seeded mid-session, it takes up to 5 min to take effect.
let soulConfigCache = {};

async function getSoulConfig(programId) {
  const docIds = [`soul_generation_${programId}`, "soul_generation"];

  for (const docId of docIds) {
    const cached = soulConfigCache[docId];
    if (cached && (Date.now() - cached.ts < SOUL_TEMPLATE_CACHE_TTL_MS)) {
      if (cached.data) return cached.data;
      continue;
    }

    const snap = await db.collection("config").doc(docId).get();
    if (!snap.exists) {
      soulConfigCache[docId] = { data: null, ts: Date.now() };
      continue;
    }

    const data = { ...snap.data(), sourceDocId: `config/${docId}` };
    soulConfigCache[docId] = { data, ts: Date.now() };
    return data;
  }

  console.log(`[soul] No config/soul_generation_${programId} or config/soul_generation doc — using hardcoded defaults`);
  return null;
}

async function getSoulTemplateConfig(programId) {
  const docId = `soul_guidelines_${programId}`;

  const cached = soulTemplateCache[docId];
  if (cached?.data && (Date.now() - cached.ts < SOUL_TEMPLATE_CACHE_TTL_MS)) {
    return cached.data;
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", `Soul guidelines not found: ${docId}. Run seed-soul-templates.mjs`);
  }
  const data = snap.data();
  if (!data.markdown || typeof data.markdown !== "string") {
    throw new functions.https.HttpsError("failed-precondition", `Soul template ${docId} has no markdown content`);
  }

  const out = {
    markdown: data.markdown,
    programId: data.programId || programId,
  };

  soulTemplateCache[docId] = { data: out, ts: Date.now() };
  return out;
}

async function callSoulGeneration(observations, interviews, guidelinesContent, studentContext, previousSoul, apiKey) {
  // Read instruction prompt + model settings from Firestore, fall back to hardcoded
  const soulConfig = await getSoulConfig(studentContext.programId);
  const systemPromptTemplate = soulConfig?.systemPrompt || null;
  const model = soulConfig?.model || SOUL_DEFAULTS.model;
  const temperature = soulConfig?.temperature ?? SOUL_DEFAULTS.temperature;
  const maxTokens = soulConfig?.max_tokens || SOUL_DEFAULTS.max_tokens;

  // Prefer program-specific Firestore prompts (config/soul_generation_{program}).
  // The legacy config/soul_generation doc remains as a fallback; hardcoded prompt
  // is only used when neither config doc exists. See #212 for later brain wiring.
  const systemContent = systemPromptTemplate
    ? injectGuidelinesContent(systemPromptTemplate, guidelinesContent)
    : buildSoulSystemPrompt(guidelinesContent);
  const userContent = buildSoulUserPrompt(studentContext, observations, interviews, previousSoul);

  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    temperature,
    max_completion_tokens: maxTokens,
  });

  let response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[soul] network error", e);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[soul] LLM error", response.status, errText?.slice?.(0, 400));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  try {
    return parseSoulResponse(rawContent);
  } catch (err) {
    throw new functions.https.HttpsError("internal", err.message);
  }
}

async function writeSoulAndGuidelines(studentId, soulContent, programId, templateConfig, observationCount, interviewCount, lastObsAt, lastInterviewAt, classroomId = null, generatedForMonth = null) {
  const aiSummariesRef = db.collection("students").doc(studentId).collection("ai_summaries");
  const soulRef = aiSummariesRef.doc("soul");
  const guidelinesRef = aiSummariesRef.doc("guidelines");
  const openQuestionsRef = aiSummariesRef.doc("open_questions");
  const now = Timestamp.now();
  const batch = db.batch();

  // Read existing soul + guidelines in parallel
  const [existingSoul, existingGuidelines] = await Promise.all([soulRef.get(), guidelinesRef.get()]);

  // Snapshot previous soul to history before overwrite
  if (existingSoul.exists) {
    const prevData = existingSoul.data();
    const historyRef = soulRef.collection("history").doc(now.toMillis().toString());
    const reason = generatedForMonth
      ? `Soul generation for ${generatedForMonth} on ${new Date().toISOString().split("T")[0]}`
      : `Soul generation on ${new Date().toISOString().split("T")[0]}`;
    batch.set(historyRef, buildHistorySnapshot(prevData, reason));
  }

  // Extract structured data from LLM response — each extractor only touches its own block
  const { suggestions: guidelinesSuggestions, content: withoutYaml } = extractGuidelinesSuggestions(soulContent);
  const { areas: openQuestionAreas, content: narrativeContent } = extractOpenQuestions(withoutYaml);

  // Write soul doc (narrative without fenced blocks)
  const soulDoc = buildSoulDoc({
    content: narrativeContent,
    programId,
    observationCount,
    interviewCount,
    lastObservationAt: lastObsAt,
    lastInterviewAt: lastInterviewAt,
  });
  soulDoc.hasEmergentObservations = hasEmergentObservations(narrativeContent);
  soulDoc.guidelinesSuggestions = guidelinesSuggestions;
  soulDoc.createdAt = existingSoul.exists ? (existingSoul.data().createdAt || now) : now;
  soulDoc.updatedAt = now;
  soulDoc.classroomId = classroomId;
  if (generatedForMonth) soulDoc.generatedForMonth = generatedForMonth;
  batch.set(soulRef, soulDoc);

  // Snapshot previous open_questions to history before overwrite (#215)
  const existingOQ = await openQuestionsRef.get();
  if (existingOQ.exists) {
    const prevOQ = existingOQ.data();
    const oqHistoryRef = openQuestionsRef.collection("history")
      .doc(prevOQ.updatedAt.toMillis().toString());
    batch.set(oqHistoryRef, buildOpenQuestionsHistorySnapshot(prevOQ, now));
  }

  // Write open_questions doc (full overwrite)
  const oqDoc = buildOpenQuestionsDoc({ areas: openQuestionAreas, programId });
  oqDoc.updatedAt = now;
  oqDoc.classroomId = classroomId;
  if (generatedForMonth) oqDoc.generatedForMonth = generatedForMonth;
  batch.set(openQuestionsRef, oqDoc);
  const areaCount = Object.keys(openQuestionAreas).length;
  if (areaCount) {
    const questionCount = Object.values(openQuestionAreas).reduce((sum, qs) => sum + qs.length, 0);
    console.log(`[soul] Generated ${questionCount} open questions across ${areaCount} areas for ${studentId}`);
  }

  // Seed guidelines from template on first run (don't overwrite existing)
  if (!existingGuidelines.exists) {
    const guidelinesDoc = buildGuidelinesDoc({
      content: templateConfig.markdown,
      programId,
      templateDocId: `config/soul_guidelines_${programId}`,
    });
    guidelinesDoc.createdAt = now;
    guidelinesDoc.updatedAt = now;
    guidelinesDoc.classroomId = classroomId;
    batch.set(guidelinesRef, guidelinesDoc);
    console.log(`[soul] Seeded guidelines for ${studentId} from soul_guidelines_${programId}`);
  }

  await batch.commit();
}

export const generateStudentProfile = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: [OPENROUTER_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const apiKey = getOpenRouterKey();
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OPENROUTER_API_KEY not configured");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to generate profiles");
    }
    const requesterRole = requesterSnap.data().role;
    if (!["superadmin", "classroomadmin", "teacher"].includes(requesterRole)) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to generate profiles");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const studentInfo = await getStudentWithProgram(studentId);
    if (!studentInfo.classroomId) {
      throw new functions.https.HttpsError("failed-precondition", "Student has no classroom assignment");
    }
    if (!studentInfo.programId || !VALID_PROGRAMS.includes(studentInfo.programId)) {
      throw new functions.https.HttpsError("failed-precondition", `Invalid program: ${studentInfo.programId}`);
    }

    // Classroom-level access check (defense-in-depth)
    if (requesterRole === "classroomadmin") {
      const manageableClassrooms = requesterSnap.data().manageableClassrooms || [];
      if (!manageableClassrooms.includes(studentInfo.classroomId)) {
        throw new functions.https.HttpsError("permission-denied", "You do not have access to this student's classroom");
      }
    } else if (requesterRole === "teacher") {
      const classroomSnap = await db.collection("classrooms").doc(studentInfo.classroomId).get();
      if (!classroomSnap.exists || !(classroomSnap.data().teacherIds || []).includes(context.auth.uid)) {
        throw new functions.https.HttpsError("permission-denied", "You do not have access to this student's classroom");
      }
    }

    // Optional targetMonth for testbench — format validation only, no range constraint.
    const targetMonth = data?.targetMonth || getCurrentMonthIST();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      throw new functions.https.HttpsError("invalid-argument", "targetMonth must be YYYY-MM format");
    }

    const windowDays = data?.windowDays ?? 365;
    return await generateSoulForStudent(studentId, apiKey, { windowDays, generatedForMonth: targetMonth });
  });

// -----------------------------------------------
// Core soul generation for a single student (no auth checks).
// Reused by the on-demand callable and the Pub/Sub worker.
// -----------------------------------------------

async function generateSoulForStudent(studentId, apiKey, { windowDays = 365, generatedForMonth = null } = {}) {
  const t0 = Date.now();
  const lap = (label) => console.log(`[soul] ${studentId} ${label} +${Date.now() - t0}ms`);

  const studentInfo = await getStudentWithProgram(studentId);
  lap("getStudentWithProgram");
  if (!studentInfo.classroomId) {
    console.warn(`[soul] Skipping ${studentId} — no classroom assignment`);
    return { status: "skipped", studentId, reason: "no_classroom" };
  }
  if (!studentInfo.programId || !VALID_PROGRAMS.includes(studentInfo.programId)) {
    console.warn(`[soul] Skipping ${studentId} — invalid program: ${studentInfo.programId}`);
    return { status: "skipped", studentId, reason: "invalid_program" };
  }

  const templateConfig = await getSoulTemplateConfig(studentInfo.programId);
  lap("getSoulTemplateConfig");

  const [notes, rawInterviews] = await Promise.all([
    fetchStudentNotesForWindow(studentId, windowDays),
    fetchStudentInterviews(studentId, windowDays),
  ]);
  lap(`fetchNotes(${notes.length})+interviews(${rawInterviews.length})`);

  const guidelinesSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("guidelines").get();
  const guidelinesContent = guidelinesSnap.exists
    ? guidelinesSnap.data().content
    : templateConfig.markdown;

  const prevSoulSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("soul").get();
  const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;
  lap("readGuidelines+prevSoul");

  if (!notes.length && !rawInterviews.length) {
    console.log(`[soul] No observations or interviews for ${studentId}, writing empty soul`);
    await writeSoulAndGuidelines(
      studentId,
      "No observations or interviews available yet.",
      studentInfo.programId,
      templateConfig,
      0, 0, null, null,
      studentInfo.classroomId,
      generatedForMonth,
    );
    return { status: "no_notes", studentId, programId: studentInfo.programId, noteCount: 0, interviewCount: 0 };
  }

  const formatted = notes.map(formatObservationForPrompt);
  const formattedInterviews = rawInterviews.map(formatInterviewForPrompt);

  const lastObsAt = notes.length ? chooseObservationTimestamp(notes[0]) : null;
  const lastInterviewAt = rawInterviews.length && rawInterviews[0].conductedAt
    ? (rawInterviews[0].conductedAt.toDate ? rawInterviews[0].conductedAt.toDate() : new Date(rawInterviews[0].conductedAt))
    : null;

  const soulContent = await callSoulGeneration(
    formatted, formattedInterviews, guidelinesContent,
    { studentName: studentInfo.studentName, dob: studentInfo.dob, age: studentInfo.age, programId: studentInfo.programId },
    previousSoul, apiKey,
  );
  lap("callSoulGeneration(LLM)");

  await writeSoulAndGuidelines(
    studentId, soulContent, studentInfo.programId, templateConfig,
    formatted.length, formattedInterviews.length, lastObsAt, lastInterviewAt,
    studentInfo.classroomId,
    generatedForMonth,
  );
  lap("writeSoulAndGuidelines");

  const { content: withoutYaml } = extractGuidelinesSuggestions(soulContent);
  const { areas: openQuestionAreas, content: narrative } = extractOpenQuestions(withoutYaml);

  const areaKeys = Object.keys(openQuestionAreas);
  const totalQuestions = Object.values(openQuestionAreas).reduce((sum, qs) => sum + qs.length, 0);
  console.log(`[soul] Generated soul for ${studentId}: ${formatted.length} observations, ${formattedInterviews.length} interviews, ${totalQuestions} open questions across ${areaKeys.length} areas (+${Date.now() - t0}ms total)`);

  return {
    status: "ok",
    studentId,
    programId: studentInfo.programId,
    noteCount: formatted.length,
    interviewCount: formattedInterviews.length,
    hasEmergentObservations: hasEmergentObservations(narrative),
    openQuestionAreaCount: areaKeys.length,
    openQuestionCount: totalQuestions,
  };
}

// -----------------------------------------------
// Pub/Sub worker: processes a batch of students (#203)
// -----------------------------------------------

/**
 * Return the current month in IST as a "YYYY-MM" string.
 * Used by the cron dispatcher and as default for callables.
 *
 * Uses UTC getters on an IST-shifted Date so the result is correct
 * regardless of the Cloud Functions runtime TZ (which defaults to UTC
 * but is not guaranteed by the platform).
 */
function getCurrentMonthIST() {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Return the next month from current IST date as a "YYYY-MM" string.
 * Used for targetMonth range validation (current + next month only).
 *
 * Date.UTC handles month overflow: month 12 rolls to Jan of next year,
 * so Dec -> Jan works correctly without manual year arithmetic.
 */
function getNextMonthIST() {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const next = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const soulWorker = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
    maxInstances: 25,
    secrets: [OPENROUTER_API_KEY],
  })
  .pubsub.topic(SOUL_TOPIC)
  .onPublish(async (message) => {
    // Parse message - validation errors are permanent, so ACK (return null)
    // to prevent infinite Pub/Sub retries on malformed messages.
    let studentIds;
    let targetMonth;
    try {
      ({ studentIds, targetMonth } = parseSoulWorkerMessage(message));
    } catch (parseErr) {
      // Include parse error and whether targetMonth was present so deploy-overlap
      // messages (old format, pre-#264) are distinguishable from truly malformed ones.
      console.error(
        "[soul-worker] bad message, ACKing to stop retries:",
        parseErr.message,
        { hasTargetMonth: Boolean(message?.json?.targetMonth) },
      );
      return null;
    }

    const apiKey = getOpenRouterKey();
    if (!apiKey) {
      console.error("[soul-worker] OPENROUTER_API_KEY not configured, ACKing");
      return null;
    }

    console.log(`[soul-worker] processing batch of ${studentIds.length} for ${targetMonth}: ${studentIds.join(", ")}`);

    // Process all students in the batch in parallel.
    // Per-student idempotency guard: skip if existing soul's generatedForMonth
    // already matches the targetMonth from the dispatcher.
    //
    // No fallback to updatedAt for old docs missing generatedForMonth (#264):
    // A missing field is simply a non-match, which correctly triggers regeneration.
    // The first run after deployment writes generatedForMonth; subsequent runs
    // match against it. This is simpler than a legacy fallback and produces
    // identical behavior - old docs get regenerated once, then are idempotent.
    const JOB_KEY = "soulRegen";
    const executionId = computeExecutionId(JOB_KEY);

    const results = await Promise.allSettled(
      studentIds.map(async (studentId) => {
        const existingSoul = await db.collection("students").doc(studentId)
          .collection("ai_summaries").doc("soul").get();
        if (existingSoul.exists && existingSoul.data().generatedForMonth === targetMonth) {
          console.log(`[soul-worker] ${studentId} already has soul for ${targetMonth}, skipping`);
          await updateWorkItem(JOB_KEY, executionId, studentId, buildWorkItemUpdate("skipped", {
            detail: "already_generated",
          })).catch(() => {});
          return { studentId, status: "skipped" };
        }

        const result = await generateSoulForStudent(studentId, apiKey, { generatedForMonth: targetMonth });
        // Write workItem based on generation result
        if (result.status === "skipped") {
          await updateWorkItem(JOB_KEY, executionId, studentId, buildWorkItemUpdate("skipped", {
            detail: result.reason,
          })).catch(() => {});
        } else {
          await updateWorkItem(JOB_KEY, executionId, studentId, buildWorkItemUpdate("success", {
            evidence: { status: result.status, generatedForMonth: targetMonth },
          })).catch(() => {});
        }
        return { studentId, ...result };
      }),
    );

    // Classify results: if any transient error occurred, throw to trigger Pub/Sub retry.
    // Already-done students will be skipped on retry via the idempotency guard.
    const PERMANENT_CODES = ["not-found", "failed-precondition"];
    let hasTransientError = false;
    let firstTransientError = null;

    for (const r of results) {
      if (r.status === "rejected") {
        const err = r.reason;
        if (err.code && PERMANENT_CODES.includes(err.code)) {
          console.error(`[soul-worker] permanent error, skipping:`, err.message);
          // Write failed workItem for permanent errors. Extract studentId from
          // the promise index (use results array position).
          const idx = results.indexOf(r);
          if (idx >= 0 && studentIds[idx]) {
            await updateWorkItem(JOB_KEY, executionId, studentIds[idx], buildWorkItemUpdate("failed", {
              failureCategory: classifyError(err),
              detail: err.message,
            })).catch(() => {});
          }
        } else {
          console.error(`[soul-worker] transient error:`, err.message);
          hasTransientError = true;
          if (!firstTransientError) firstTransientError = err;
          // Do NOT write terminal workItem for transient errors -
          // Pub/Sub will retry and the idempotency guard handles it
        }
      }
    }

    if (hasTransientError) {
      throw firstTransientError; // Pub/Sub will retry the batch
    }

    return null;
  });

// -----------------------------------------------
// Shared dispatcher helper: publish in waves with jitter (#203)
// Publishes maxInstances batches at a time, waits 90s between waves
// so workers finish before the next wave arrives.
// -----------------------------------------------

const WAVE_SIZE = 25; // match maxInstances
// 90s between waves. With 540s timeout and ~2s publish overhead per wave,
// the dispatcher can handle ~6 waves = 6 * 25 * 10 = 1,500 students safely
// (theoretical max ~1,750 before timeout). Current school size: ~478.
const WAVE_GAP_MS = 90_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function publishInWaves(studentIds, logPrefix, { targetMonth }) {
  if (!targetMonth) {
    throw new Error("publishInWaves: targetMonth is required");
  }
  const chunks = chunkStudentIds(studentIds);
  // Group chunks into waves of WAVE_SIZE
  const waves = [];
  for (let i = 0; i < chunks.length; i += WAVE_SIZE) {
    waves.push(chunks.slice(i, i + WAVE_SIZE));
  }
  let published = 0;
  let publishFailed = 0;

  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w];
    if (w > 0) {
      console.log(`${logPrefix} waiting ${WAVE_GAP_MS / 1000}s before wave ${w + 1}/${waves.length}`);
      await sleep(WAVE_GAP_MS);
    }
    console.log(`${logPrefix} publishing wave ${w + 1}/${waves.length}: ${wave.length} batches`);

    await Promise.all(
      wave.map(async (batch) => {
        try {
          const payload = JSON.stringify({ studentIds: batch, targetMonth });
          await soulTopic.publishMessage({ data: Buffer.from(payload) });
          published++;
        } catch (err) {
          publishFailed++;
          console.error(`${logPrefix} publish failed for batch [${batch.join(", ")}]:`, err.message);
        }
      }),
    );
  }

  return { published, publishFailed };
}

// -----------------------------------------------
// Dispatcher: monthly scheduled soul regeneration (#203)
// Lightweight - fetches active students, chunks, publishes to Pub/Sub.
// -----------------------------------------------

export const regenerateSoulsMonthly = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 2 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const JOB_KEY = "soulRegen";
    const startTime = Date.now();
    const targetMonth = getCurrentMonthIST();
    const executionId = computeExecutionId(JOB_KEY);
    console.log(`[soul-dispatcher] starting monthly dispatch run for ${targetMonth}`);

    try {
      const studentIds = await fetchActiveStudentIds();
      console.log(`[soul-dispatcher] ${studentIds.length} active students total`);

      // Ledger: create execution + seed workItems in parallel with publishing
      await createExecution(JOB_KEY, executionId, studentIds.length);
      const [, result] = await Promise.all([
        seedWorkItems(JOB_KEY, executionId, studentIds),
        publishInWaves(studentIds, "[soul-dispatcher]", { targetMonth }),
      ]);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const logFn = result.publishFailed > 0 ? console.error : console.log;
      logFn(`[soul-dispatcher] done in ${duration}s for ${targetMonth}: ${result.published} batches published (${studentIds.length} students), ${result.publishFailed} failed`);
      return null;
    } catch (err) {
      console.error("[soul-dispatcher] Fatal error:", err);
      await markExecutionFailed(JOB_KEY, executionId, err).catch(() => {});
      throw err;
    }
  });

// -----------------------------------------------
// Manual trigger: superadmin-only callable dispatcher (#203)
// Replaces backfillStudentProfiles.
// -----------------------------------------------

export const triggerSoulGeneration = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can trigger soul generation");
    }

    // Validate required targetMonth parameter (#264)
    const targetMonth = data?.targetMonth;
    if (!targetMonth || typeof targetMonth !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "targetMonth is required (YYYY-MM format)");
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
      throw new functions.https.HttpsError("invalid-argument", "targetMonth must be YYYY-MM format");
    }
    const currentMonth = getCurrentMonthIST();
    const nextMonth = getNextMonthIST();
    if (targetMonth !== currentMonth && targetMonth !== nextMonth) {
      throw new functions.https.HttpsError("invalid-argument", `targetMonth must be current (${currentMonth}) or next month (${nextMonth})`);
    }

    const startTime = Date.now();
    let studentIds;

    if (data?.studentIds && Array.isArray(data.studentIds) && data.studentIds.length > 0) {
      studentIds = data.studentIds.map((id) => String(id).trim()).filter(Boolean);
      console.log(`[soul-dispatcher] manual trigger for ${studentIds.length} specific students, targetMonth=${targetMonth}`);
    } else {
      studentIds = await fetchActiveStudentIds();
      console.log(`[soul-dispatcher] manual trigger for all ${studentIds.length} active students, targetMonth=${targetMonth}`);
    }

    // targetMonth is the single intent signal — providing it means "generate for
    // this month regardless of existing state." The worker's idempotency guard
    // checks generatedForMonth against targetMonth; a match skips, a mismatch
    // regenerates. No separate force flag needed. (#264)
    const result = await publishInWaves(studentIds, "[soul-dispatcher]", { targetMonth });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[soul-dispatcher] manual trigger done in ${duration}s for ${targetMonth}: ${result.published} batches published (${studentIds.length} students), ${result.publishFailed} failed`);

    return {
      status: result.publishFailed > 0 ? "partial" : "ok",
      targetMonth,
      studentsDispatched: studentIds.length,
      batchesPublished: result.published,
      batchesFailed: result.publishFailed,
      durationSec: parseFloat(duration),
    };
  });

// -----------------------------------------------
// Test Bench: Soul generation with caller-supplied prompt (PEP-163)
// -----------------------------------------------

export async function testBenchSoul({ studentId, systemPrompt, guidelinesContent, model, temperature, maxTokens, windowDays, includeInterviews, apiKey }) {
  const studentInfo = await getStudentWithProgram(studentId);

  // If no guidelines provided, load from student or template
  if (!guidelinesContent) {
    const guidelinesSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("guidelines").get();
    if (guidelinesSnap.exists) {
      guidelinesContent = guidelinesSnap.data().content;
    } else {
      const templateConfig = await getSoulTemplateConfig(studentInfo.programId);
      guidelinesContent = templateConfig.markdown;
    }
  }

  // Inject guidelines into instruction prompt via placeholder. Mirrors the
  // production path so Firestore prompts can use either historical format.
  const finalSystemPrompt = injectGuidelinesContent(systemPrompt, guidelinesContent);

  // Gather observations + interviews
  const [notes, rawInterviews] = await Promise.all([
    fetchStudentNotesForWindow(studentId, windowDays),
    includeInterviews ? fetchStudentInterviews(studentId, windowDays) : Promise.resolve([]),
  ]);

  const formatted = notes.map(formatObservationForPrompt);
  const formattedInterviews = rawInterviews.map(formatInterviewForPrompt);

  // Read previous soul for continuity
  const prevSoulSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("soul").get();
  const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;

  const userContent = buildSoulUserPrompt(
    { studentName: studentInfo.studentName, dob: studentInfo.dob, age: studentInfo.age, programId: studentInfo.programId },
    formatted,
    formattedInterviews,
    previousSoul,
  );

  // Call LLM with caller-supplied prompt + model settings
  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: userContent },
    ],
    temperature,
    max_completion_tokens: maxTokens,
  });

  let response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[testBenchSoul] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable: " + (err.message || "network error"));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new functions.https.HttpsError("internal", `LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  return { output: rawContent || "(empty response)", totalTokens };
}

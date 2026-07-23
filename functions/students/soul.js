import * as functions from "firebase-functions/v1";
import { db, Timestamp } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_API_KEY, getOpenRouterKey, OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import {
  SOUL_DEFAULTS,
  VALID_PROGRAMS,
  buildSoulSystemPrompt,
  buildSoulUserPrompt,
  parseSoulResponse,
  buildSoulDoc,
  buildGuidelinesDoc,
  buildOpenQuestionsDoc,
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

// -----------------------------------------------
// Student Soul: Generate soul narrative for a single student (PEP-149)
// Replaces the old per-dimension profile system (PEP-124)
// -----------------------------------------------

const SOUL_TOPIC = "soul-workers";
const pubsub = new PubSub();
const soulTopic = pubsub.topic(SOUL_TOPIC);

const SOUL_TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let soulTemplateCache = {};
// Missing-doc result (null) is cached for TTL to avoid Firestore hammering.
// If config/soul_generation is seeded mid-session, it takes up to 5 min to take effect.
let soulConfigCache = { data: null, ts: 0 };

async function getSoulConfig() {
  if (soulConfigCache.ts && (Date.now() - soulConfigCache.ts < SOUL_TEMPLATE_CACHE_TTL_MS)) {
    return soulConfigCache.data;
  }
  const snap = await db.collection("config").doc("soul_generation").get();
  if (!snap.exists) {
    console.log("[soul] No config/soul_generation doc — using hardcoded defaults");
    soulConfigCache = { data: null, ts: Date.now() };
    return null;
  }
  const data = snap.data();
  soulConfigCache = { data, ts: Date.now() };
  return data;
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
  const soulConfig = await getSoulConfig();
  const systemPromptTemplate = soulConfig?.systemPrompt || null;
  const model = soulConfig?.model || SOUL_DEFAULTS.model;
  const temperature = soulConfig?.temperature ?? SOUL_DEFAULTS.temperature;
  const maxTokens = soulConfig?.max_tokens || SOUL_DEFAULTS.max_tokens;

  // If Firestore has a systemPrompt with ${guidelinesContent} placeholder, inject guidelines.
  // Otherwise fall back to the hardcoded buildSoulSystemPrompt().
  const systemContent = systemPromptTemplate
    ? (systemPromptTemplate.includes("${guidelinesContent}")
      ? systemPromptTemplate.replace("${guidelinesContent}", () => guidelinesContent)
      : systemPromptTemplate + "\n\n" + guidelinesContent)
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

async function writeSoulAndGuidelines(studentId, soulContent, programId, templateConfig, observationCount, interviewCount, lastObsAt, lastInterviewAt, classroomId = null) {
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
    batch.set(historyRef, buildHistorySnapshot(prevData, `Weekly regeneration on ${new Date().toISOString().split("T")[0]}`));
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
  batch.set(soulRef, soulDoc);

  // Write open_questions doc (full overwrite, no archiving)
  const oqDoc = buildOpenQuestionsDoc({ areas: openQuestionAreas, programId });
  oqDoc.updatedAt = now;
  oqDoc.classroomId = classroomId;
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

    const windowDays = data?.windowDays ?? 365;
    return await generateSoulForStudent(studentId, apiKey, { windowDays });
  });

// -----------------------------------------------
// Core soul generation for a single student (no auth checks).
// Reused by the on-demand callable and the Pub/Sub worker.
// -----------------------------------------------

async function generateSoulForStudent(studentId, apiKey, { windowDays = 365 } = {}) {
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
 * Check whether a Firestore Timestamp falls in the current month (IST).
 */
function isCurrentMonthIST(firestoreTimestamp) {
  if (!firestoreTimestamp) return false;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const ts = firestoreTimestamp.toDate ? firestoreTimestamp.toDate() : new Date(firestoreTimestamp);
  const istTs = new Date(ts.getTime() + IST_OFFSET_MS);
  return istNow.getFullYear() === istTs.getFullYear() && istNow.getMonth() === istTs.getMonth();
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
    try {
      ({ studentIds } = parseSoulWorkerMessage(message));
    } catch (parseErr) {
      console.error("[soul-worker] bad message, ACKing to stop retries:", parseErr.message);
      return null;
    }

    const apiKey = getOpenRouterKey();
    if (!apiKey) {
      console.error("[soul-worker] OPENROUTER_API_KEY not configured, ACKing");
      return null;
    }

    console.log(`[soul-worker] processing batch of ${studentIds.length}: ${studentIds.join(", ")}`);

    // Process all students in the batch in parallel.
    // Per-student idempotency guard: skip if soul.updatedAt is in the current month.
    const results = await Promise.allSettled(
      studentIds.map(async (studentId) => {
        // Idempotency guard
        const existingSoul = await db.collection("students").doc(studentId)
          .collection("ai_summaries").doc("soul").get();
        if (existingSoul.exists && isCurrentMonthIST(existingSoul.data().updatedAt)) {
          console.log(`[soul-worker] ${studentId} already has soul for current month, skipping`);
          return { studentId, status: "skipped" };
        }

        const result = await generateSoulForStudent(studentId, apiKey);
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
        } else {
          console.error(`[soul-worker] transient error:`, err.message);
          hasTransientError = true;
          if (!firstTransientError) firstTransientError = err;
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
const WAVE_GAP_MS = 90_000; // 90 seconds between waves
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function publishInWaves(studentIds, logPrefix) {
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
          const payload = JSON.stringify({ studentIds: batch });
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
    const startTime = Date.now();
    console.log("[soul-dispatcher] starting monthly dispatch run");

    const studentIds = await fetchActiveStudentIds();
    console.log(`[soul-dispatcher] ${studentIds.length} active students total`);

    const result = await publishInWaves(studentIds, "[soul-dispatcher]");

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[soul-dispatcher] done in ${duration}s: ${result.published} batches published (${studentIds.length} students), ${result.publishFailed} failed`);
    return null;
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

    const startTime = Date.now();
    let studentIds;

    if (data?.studentIds && Array.isArray(data.studentIds) && data.studentIds.length > 0) {
      // Specific students requested - publish unconditionally (no idempotency pre-filter)
      studentIds = data.studentIds.map((id) => String(id).trim()).filter(Boolean);
      console.log(`[soul-dispatcher] manual trigger for ${studentIds.length} specific students`);
    } else {
      // All active students - no pre-filter (worker handles idempotency)
      studentIds = await fetchActiveStudentIds();
      console.log(`[soul-dispatcher] manual trigger for all ${studentIds.length} active students`);
    }

    const result = await publishInWaves(studentIds, "[soul-dispatcher]");

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[soul-dispatcher] manual trigger done in ${duration}s: ${result.published} batches published (${studentIds.length} students), ${result.publishFailed} failed`);

    return {
      status: "ok",
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

  // Inject guidelines into instruction prompt via placeholder
  const finalSystemPrompt = systemPrompt.includes("${guidelinesContent}")
    ? systemPrompt.replace("${guidelinesContent}", () => guidelinesContent)
    : systemPrompt + "\n\n" + guidelinesContent;

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

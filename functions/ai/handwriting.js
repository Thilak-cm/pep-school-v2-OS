import * as functions from "firebase-functions/v1";
import { db, storage, Timestamp } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import {
  HANDWRITING_ANALYSIS_DEFAULTS,
  HANDWRITING_ANALYSIS_FALLBACK_PROMPT,
  getFallbackPromptForProgram,
} from "../config/handwritingAnalysisFallbacks.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";
import { buildBatchWritingPrompt, calculateAge, parseWritingAnalysisResponse } from "../utils/handwritingAnalysisHelpers.js";

// -----------------------------------------------
// AI: Batch Writing Analysis (PEP-132, PEP-263)
// -----------------------------------------------

const WRITING_CACHE_TTL_MS = 5 * 60 * 1000;
const configCacheByProgram = {};

/**
 * Fetch writing analysis config for a specific program.
 * Reads config/writing_analysis_{programId} with 5-min per-program cache.
 * Falls back to program-specific hardcoded prompt, then generic fallback.
 */
async function getWritingAnalysisConfig(programId, { forceRefresh = false } = {}) {
  const cacheKey = programId || "_generic";

  if (!forceRefresh && configCacheByProgram[cacheKey]?.data &&
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
    console.warn(`[batchWriting] config fetch failed for ${cacheKey}, using fallback:`, err?.message);
    const out = {
      systemPrompt: fallbackPrompt,
      ...HANDWRITING_ANALYSIS_DEFAULTS,
    };
    configCacheByProgram[cacheKey] = { data: out, ts: Date.now() };
    return out;
  }
}

/**
 * Fetch unprocessed handwritten media docs for a student.
 * Returns docs ordered by observedAt ascending.
 */
async function fetchUnprocessedHandwriting(studentId) {
  const mediaRef = db.collection("students").doc(studentId).collection("media");
  const snap = await mediaRef
    .where("handwritten", "==", true)
    .where("status", "==", "ready")
    .orderBy("observedAt", "asc")
    .get();

  const docs = [];
  snap.forEach((doc) => {
    const d = doc.data();
    // Skip already-processed docs
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
 * Download an image from Firebase Storage and return as base64 data URI content part.
 */
export async function downloadImageAsBase64(storagePath) {
  const bucket = storage.bucket();
  const [buffer] = await bucket.file(storagePath).download();
  const base64 = buffer.toString("base64");
  const ext = storagePath.split(".").pop()?.toLowerCase();
  const mimeMap = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  const mime = mimeMap[ext] || "image/webp";
  return {
    type: "image_url",
    image_url: { url: `data:${mime};base64,${base64}` },
  };
}

/**
 * Run a VLM call with image(s) and return parsed JSON.
 */
async function runVLMCall(systemPrompt, userContent, modelInfo) {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  const enhancedPrompt = systemPrompt.includes("JSON") || systemPrompt.includes("json")
    ? systemPrompt
    : systemPrompt + "\n\nIMPORTANT: You must respond with valid JSON only.";

  const body = buildChatBody({
    model: modelInfo.model,
    messages: [
      { role: "system", content: enhancedPrompt },
      { role: "user", content: userContent },
    ],
    temperature: modelInfo.temperature,
    max_completion_tokens: modelInfo.maxTokens,
    response_format: { type: "json_object" },
  });

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[runVLMCall] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[runVLMCall] OpenAI error", response.status, errText?.slice?.(0, 300));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
  }
}

/**
 * Build multimodal user content (text annotations interleaved with base64 images).
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
        console.warn(`[batchWriting] Failed to download ${doc.storagePath}:`, err?.message);
        userContent.push({ type: "text", text: `[Image could not be loaded: ${doc.storagePath}]` });
      }
    }
  }

  return { userContent, successfulDownloads };
}

/**
 * Archive the existing writing_analysis doc to a history subcollection
 * before overwriting it. Follows the weekly_snapshot archive pattern (PEP-229).
 */
async function archiveWritingAnalysis(studentId, batch) {
  const analysisRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis");
  const existing = await analysisRef.get();

  if (existing.exists) {
    const prevData = existing.data();
    const ts = prevData.generatedAt?.toDate?.() ?? new Date();
    const historyKey = ts.toISOString().replace(/[:.]/g, "-");
    const historyRef = analysisRef.collection("history").doc(historyKey);
    batch.set(historyRef, {
      ...prevData,
      archivedAt: Timestamp.now(),
    });
  }
}

/**
 * Resolve programId for a student via their classroom.
 */
async function resolveProgramId(studentData) {
  const classroomId = studentData.classroomId;
  if (!classroomId) return null;
  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  return classroomSnap.exists ? (classroomSnap.data()?.programId || null) : null;
}

// -----------------------------------------------
// Core: shared writing analysis runner (PEP-263)
// Used by both the callable and the scheduled CF.
// -----------------------------------------------

/**
 * Run writing analysis for a single student.
 * Both the callable and scheduled CF delegate to this function.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, skip Firestore writes
 * @param {string} [options.programId] - Pre-resolved programId (skips resolveProgramId read)
 * @param {boolean} [options.archive] - If true, archive previous analysis before overwriting
 * @param {Object} [options.studentData] - Pre-fetched student doc data (skips student doc read)
 * @returns {{ status, analysis?, reason?, count?, threshold? }}
 */
async function runWritingAnalysisForStudent(studentId, { dryRun = false, programId: passedProgramId = undefined, archive = false, studentData: passedStudentData = undefined } = {}) {
  let studentData = passedStudentData;
  if (!studentData) {
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
    }
    studentData = studentSnap.data();
  }

  // Resolve program for per-program config (skip if already provided by caller)
  const programId = passedProgramId !== undefined ? passedProgramId : await resolveProgramId(studentData);
  const config = await getWritingAnalysisConfig(programId);

  // Fetch unprocessed handwritten media only
  const mediaDocs = await fetchUnprocessedHandwriting(studentId);

  // Threshold gate
  if (mediaDocs.length < config.minSamples) {
    return { status: "skipped", reason: "insufficient_samples", count: mediaDocs.length, threshold: config.minSamples };
  }

  const dob = studentData.dateOfBirth?.toDate?.() ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
  const student = {
    displayName: studentData.displayName || studentId,
    dateOfBirth: dob,
  };

  // Previous analysis for longitudinal context
  const prevSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis").get();
  const previousAnalysis = prevSnap.exists ? prevSnap.data() : null;

  // Build prompt and download images
  const now = new Date();
  const promptText = buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, now);
  const { userContent, successfulDownloads } = await buildUserContent(mediaDocs, promptText);

  if (successfulDownloads < config.minSamples) {
    return { status: "skipped", reason: "insufficient_images_loaded", successfulDownloads, totalDocs: mediaDocs.length };
  }

  // VLM call
  const vlmResult = await runVLMCall(config.systemPrompt, userContent, {
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
  });

  const parsed = parseWritingAnalysisResponse(vlmResult);
  if (!parsed) {
    throw new functions.https.HttpsError("internal", "Failed to parse VLM response");
  }

  const age = calculateAge(student.dateOfBirth, now);
  const analysisDoc = {
    ...parsed,
    sampleCount: mediaDocs.length,
    copiedCount: mediaDocs.filter((d) => d.copied === true).length,
    studentAge: age,
    generatedAt: Timestamp.now(),
    sourceMediaIds: mediaDocs.map((d) => d.id),
    model: config.model,
    programId: programId || null,
    status: "completed",
  };

  if (dryRun) {
    return { status: "completed", dryRun: true, analysis: analysisDoc };
  }

  // Archive previous (only from scheduled CF), write new, mark media as processed
  const batch = db.batch();
  if (archive) {
    await archiveWritingAnalysis(studentId, batch);
  }
  const analysisRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis");
  batch.set(analysisRef, analysisDoc);
  // Cap batch marking at 450 docs (Firestore batch limit is 500; leave room for archive + analysis writes)
  const markLimit = 450;
  if (mediaDocs.length > markLimit) {
    console.warn(`[batchWriting] ${studentId}: ${mediaDocs.length} media docs exceed batch limit, marking only first ${markLimit}`);
  }
  const docsToMark = mediaDocs.slice(0, markLimit);
  for (const doc of docsToMark) {
    const mediaRef = db.collection("students").doc(studentId).collection("media").doc(doc.id);
    batch.update(mediaRef, { batchAnalyzedAt: Timestamp.now() });
  }
  await batch.commit();

  console.log(`[batchWriting] Completed for ${studentId}: ${mediaDocs.length} samples analyzed`);
  return { status: "completed", analysis: analysisDoc };
}

// -----------------------------------------------
// Callable: On-demand writing analysis (PEP-132, PEP-263)
// -----------------------------------------------

export const batchAnalyzeWriting = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // Role check: allow superadmin, classroomadmin, teacher (PEP-235)
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;
    if (!["superadmin", "classroomadmin", "teacher"].includes(callerRole)) {
      throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    // Classroom-level access check for non-superadmins
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
    }
    const studentData = studentSnap.data();

    if (!studentData.classroomId && callerRole !== "superadmin") {
      throw new functions.https.HttpsError("failed-precondition", "Student has no assigned classroom");
    }
    if (callerRole === "classroomadmin") {
      const manageableClassrooms = callerSnap.data().manageableClassrooms || [];
      if (!manageableClassrooms.includes(studentData.classroomId)) {
        throw new functions.https.HttpsError("permission-denied", "No access to this student's classroom");
      }
    } else if (callerRole === "teacher") {
      const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
      const teacherIds = classroomSnap.exists ? (classroomSnap.data().teacherIds || []) : [];
      if (!teacherIds.includes(context.auth.uid)) {
        throw new functions.https.HttpsError("permission-denied", "No access to this student's classroom");
      }
    }

    return runWritingAnalysisForStudent(studentId, { dryRun: data?.dryRun === true, studentData });
  });

// -----------------------------------------------
// Scheduled: Weekly writing analysis for all active students (PEP-263)
// -----------------------------------------------

export const generateWritingAnalysis = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .pubsub.schedule("0 0 * * 1")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      console.error("[writingAnalysis] OpenAI key not configured");
      return null;
    }

    const studentIds = await fetchActiveStudentIds();
    console.log(`[writingAnalysis] running for ${studentIds.length} active student(s)`);

    let completed = 0;
    let skipped = 0;
    let errors = 0;

    await runWithConcurrency(studentIds, async (studentId) => {
      try {
        // Read student once, resolve program, then pass both into the runner
        const studentSnap = await db.collection("students").doc(studentId).get();
        if (!studentSnap.exists) { skipped++; return; }
        const studentData = studentSnap.data();
        const programId = await resolveProgramId(studentData);
        if (!programId) { skipped++; return; }

        const result = await runWritingAnalysisForStudent(studentId, {
          programId,
          archive: true,
          studentData,
        });
        if (result.status === "completed") {
          completed++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`[writingAnalysis] error for ${studentId}:`, err?.message);
        errors++;
      }
    }, 8);

    console.log(`[writingAnalysis] done — completed: ${completed}, skipped: ${skipped}, errors: ${errors}`);
    return null;
  });

// -----------------------------------------------
// Test Bench: Handwriting analysis with caller-supplied prompt (PEP-163)
// -----------------------------------------------

export async function testBenchHandwriting({ studentId, systemPrompt, model, temperature, maxTokens, apiKey }) {
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
  }
  const studentData = studentSnap.data();
  const dob = studentData.dateOfBirth?.toDate?.() ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
  const student = { displayName: studentData.displayName || studentId, dateOfBirth: dob };

  // Fetch ALL handwritten media (not just unprocessed — test bench needs full set)
  const mediaSnap = await db.collection("students").doc(studentId)
    .collection("media")
    .where("handwritten", "==", true)
    .orderBy("observedAt", "asc")
    .get();

  if (mediaSnap.empty) {
    return { output: "No handwritten media found for this student.", totalTokens: 0 };
  }

  const mediaDocs = mediaSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      observedAt: data.observedAt?.toDate?.() ?? (data.observedAt ? new Date(data.observedAt) : null),
      teacherComment: data.teacherComment || null,
      copied: data.copied === true,
      curriculumArea: data.curriculumArea || null,
      createdByName: data.createdByName || null,
      storagePath: data.media?.[0]?.storagePath || null,
    };
  });

  const prevAnalysisSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis").get();
  const previousAnalysis = prevAnalysisSnap.exists ? prevAnalysisSnap.data() : null;

  const promptText = buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, new Date());

  const userContent = [];
  const promptLines = promptText.split("\n");
  const firstImageIdx = promptLines.findIndex((l) => l.startsWith("[Image "));
  if (firstImageIdx > 0) {
    userContent.push({ type: "text", text: promptLines.slice(0, firstImageIdx).join("\n") });
  }

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
      } catch (err) {
        console.warn(`[testBench] Failed to download ${doc.storagePath}:`, err?.message);
        userContent.push({ type: "text", text: "[Image could not be loaded]" });
      }
    }
  }

  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
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
    console.error("[testBenchHandwriting] network error", err);
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

import * as functions from "firebase-functions/v1";
import { db, storage, Timestamp } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { HANDWRITING_ANALYSIS_DEFAULTS, HANDWRITING_ANALYSIS_FALLBACK_PROMPT } from "../config/handwritingAnalysisFallbacks.js";
import { buildBatchWritingPrompt, calculateAge, parseWritingAnalysisResponse } from "../utils/handwritingAnalysisHelpers.js";

// -----------------------------------------------
// AI: Batch Writing Analysis (PEP-132)
// -----------------------------------------------

const HANDWRITING_CACHE_TTL_MS = 5 * 60 * 1000;
let handwritingConfigCache = { data: null, ts: 0 };

async function getHandwritingAnalysisConfig({ forceRefresh = false } = {}) {
  if (!forceRefresh && handwritingConfigCache?.data && (Date.now() - handwritingConfigCache.ts < HANDWRITING_CACHE_TTL_MS)) {
    return handwritingConfigCache.data;
  }

  try {
    const snap = await db.collection("config").doc("handwriting_analysis").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      systemPrompt: String(data.systemPrompt || HANDWRITING_ANALYSIS_FALLBACK_PROMPT),
      model: data.model || HANDWRITING_ANALYSIS_DEFAULTS.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : HANDWRITING_ANALYSIS_DEFAULTS.temperature,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : HANDWRITING_ANALYSIS_DEFAULTS.max_tokens,
      minSamples: Number.isFinite(data.minSamples) ? data.minSamples : HANDWRITING_ANALYSIS_DEFAULTS.minSamples,
    };
    handwritingConfigCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn("[batchWriting] config fetch failed, using defaults:", err?.message);
    const out = {
      systemPrompt: HANDWRITING_ANALYSIS_FALLBACK_PROMPT,
      ...HANDWRITING_ANALYSIS_DEFAULTS,
    };
    handwritingConfigCache = { data: out, ts: Date.now() };
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
  // Determine content type from path
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

export const batchAnalyzeWriting = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // Superadmin-only: internal callable invoked by backend cron
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Superadmin access required");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }
    const dryRun = data?.dryRun === true;

    const config = await getHandwritingAnalysisConfig();

    // AC1: Query unprocessed handwritten media (batchAnalyzedAt marker-based filtering)
    const mediaDocs = await fetchUnprocessedHandwriting(studentId);

    // AC2: Threshold gate
    if (mediaDocs.length < config.minSamples) {
      return { status: "skipped", reason: "insufficient_samples", count: mediaDocs.length, threshold: config.minSamples };
    }

    // Fetch student context for age + name
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
    }
    const studentData = studentSnap.data();
    const dob = studentData.dateOfBirth?.toDate?.() ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
    const student = {
      displayName: studentData.displayName || studentId,
      dateOfBirth: dob,
    };

    // Fetch previous analysis for longitudinal context in prompt
    const prevAnalysisSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis").get();
    const previousAnalysis = prevAnalysisSnap.exists ? prevAnalysisSnap.data() : null;

    // AC3: Build prompt and download images
    const now = new Date();
    const promptText = buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, now);

    // Build user content with interleaved text annotations and images
    const userContent = [];
    const promptLines = promptText.split("\n");

    // Add preamble (everything before the first [Image line)
    const firstImageIdx = promptLines.findIndex((l) => l.startsWith("[Image "));
    if (firstImageIdx > 0) {
      userContent.push({ type: "text", text: promptLines.slice(0, firstImageIdx).join("\n") });
    }

    // Add each image with its annotation
    let successfulDownloads = 0;
    for (let i = 0; i < mediaDocs.length; i++) {
      const doc = mediaDocs[i];
      // Find annotation lines for this image
      const imageHeader = `[Image ${i + 1} of ${mediaDocs.length}`;
      const startIdx = promptLines.findIndex((l) => l.startsWith(imageHeader));
      const nextImageIdx = i < mediaDocs.length - 1
        ? promptLines.findIndex((l, idx) => idx > startIdx && l.startsWith(`[Image ${i + 2}`))
        : promptLines.length;
      const annotationText = promptLines.slice(startIdx, nextImageIdx).join("\n").trim();
      userContent.push({ type: "text", text: annotationText });

      // Download and add image
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

    // Guard: don't call VLM if too few images loaded successfully
    if (successfulDownloads < config.minSamples) {
      return {
        status: "skipped",
        reason: "insufficient_images_loaded",
        successfulDownloads,
        totalDocs: mediaDocs.length,
      };
    }

    // AC4: Run VLM call
    let vlmResult;
    try {
      vlmResult = await runVLMCall(config.systemPrompt, userContent, {
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
      });
    } catch (err) {
      console.error("[batchWriting] VLM call failed:", err?.message);
      throw new functions.https.HttpsError("internal", err?.message || "VLM call failed");
    }

    const parsed = parseWritingAnalysisResponse(vlmResult);
    if (!parsed) {
      console.error("[batchWriting] Failed to parse VLM response:", vlmResult);
      throw new functions.https.HttpsError("internal", "Failed to parse VLM response");
    }

    // Build output document
    const age = calculateAge(student.dateOfBirth, now);
    const sourceMediaIds = mediaDocs.map((d) => d.id);
    const copiedCount = mediaDocs.filter((d) => d.copied === true).length;

    const analysisDoc = {
      ...parsed,
      sampleCount: mediaDocs.length,
      copiedCount,
      studentAge: age,
      generatedAt: Timestamp.now(),
      sourceMediaIds,
      model: config.model,
      status: "completed",
    };

    if (dryRun) {
      return { status: "completed", dryRun: true, analysis: analysisDoc };
    }

    // Atomic write: analysis doc + mark processed media docs in one batch
    const batch = db.batch();
    const analysisRef = db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis");
    batch.set(analysisRef, analysisDoc);
    for (const doc of mediaDocs) {
      const mediaRef = db.collection("students").doc(studentId).collection("media").doc(doc.id);
      batch.update(mediaRef, { batchAnalyzedAt: Timestamp.now() });
    }
    await batch.commit();

    console.log(`[batchWriting] Completed for ${studentId}: ${mediaDocs.length} samples analyzed`);
    return { status: "completed", analysis: analysisDoc };
  });

// -----------------------------------------------
// Test Bench: Handwriting analysis with caller-supplied prompt (PEP-163)
// -----------------------------------------------

export async function testBenchHandwriting({ studentId, systemPrompt, model, temperature, maxTokens, apiKey }) {
  // Gather same data as batchAnalyzeWriting but skip the threshold gate and use caller's prompt
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

  // Build multimodal user content with images
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

  // Call LLM directly — do NOT use runVLMCall (it forces JSON output)
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

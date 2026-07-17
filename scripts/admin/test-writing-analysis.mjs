/**
 * Test batch writing analysis for a student.
 *
 * Runs the same logic as the batchAnalyzeWriting Cloud Function but locally
 * via firebase-admin SDK. Defaults to dryRun mode.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/admin/test-writing-analysis.mjs <studentId>
 *   OPENAI_API_KEY=sk-... node scripts/admin/test-writing-analysis.mjs 2025-GUL-030
 *   OPENAI_API_KEY=sk-... node scripts/admin/test-writing-analysis.mjs 2025-GUL-030 --live
 *
 * Requires: OPENAI_API_KEY environment variable
 */
import admin from "firebase-admin";
import { HANDWRITING_ANALYSIS_DEFAULTS, HANDWRITING_ANALYSIS_FALLBACK_PROMPT } from "../../functions/config/handwritingAnalysisFallbacks.js";
import { buildBatchWritingPrompt, calculateAge, parseWritingAnalysisResponse } from "../../functions/utils/handwritingAnalysisHelpers.js";

// --- Firebase init ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}
const db = admin.firestore();
const storage = admin.storage();

// --- Args ---
const studentId = process.argv[2];
const isLive = process.argv.includes("--live");
if (!studentId) {
  console.error("Usage: node scripts/admin/test-writing-analysis.mjs <studentId> [--live]");
  process.exit(1);
}
const openAiKey = process.env.OPENAI_API_KEY;
if (!openAiKey) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

// --- Config ---
async function loadConfig() {
  try {
    const snap = await db.collection("config").doc("handwriting_analysis").get();
    const data = snap.exists ? snap.data() : {};
    return {
      systemPrompt: data.systemPrompt || HANDWRITING_ANALYSIS_FALLBACK_PROMPT,
      model: data.model || HANDWRITING_ANALYSIS_DEFAULTS.model,
      temperature: typeof data.temperature === "number" ? data.temperature : HANDWRITING_ANALYSIS_DEFAULTS.temperature,
      max_tokens: typeof data.max_tokens === "number" ? data.max_tokens : HANDWRITING_ANALYSIS_DEFAULTS.max_tokens,
      minSamples: typeof data.minSamples === "number" ? data.minSamples : HANDWRITING_ANALYSIS_DEFAULTS.minSamples,
    };
  } catch (err) {
    console.warn("Config fetch failed, using fallbacks:", err.message);
    return { systemPrompt: HANDWRITING_ANALYSIS_FALLBACK_PROMPT, ...HANDWRITING_ANALYSIS_DEFAULTS };
  }
}

// --- Query ---
async function fetchUnprocessedHandwriting(sid) {
  const snap = await db.collection("students").doc(sid).collection("media")
    .where("handwritten", "==", true)
    .where("status", "==", "ready")
    .orderBy("observedAt", "asc")
    .get();

  const docs = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.batchAnalyzedAt) return;
    const observedAt = d.observedAt?.toDate?.() ?? null;
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

// --- Download image ---
async function downloadImageAsBase64(storagePath) {
  const bucket = storage.bucket("pep-os.firebasestorage.app");
  const [buffer] = await bucket.file(storagePath).download();
  const base64 = buffer.toString("base64");
  const ext = storagePath.split(".").pop()?.toLowerCase();
  const mimeMap = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  const mime = mimeMap[ext] || "image/webp";
  return { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } };
}

// --- VLM call ---
async function runVLMCall(systemPrompt, userContent, modelInfo) {
  const body = {
    model: modelInfo.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_completion_tokens: modelInfo.max_tokens,
    response_format: { type: "json_object" },
  };
  // Only add temperature for non-reasoning models
  const isReasoning = modelInfo.model.startsWith("gpt-5") && !modelInfo.model.includes("-chat");
  if (!isReasoning && modelInfo.temperature != null) {
    body.temperature = modelInfo.temperature;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned no content");
  return JSON.parse(content);
}

// --- Main ---
async function main() {
  console.log(`\n=== Batch Writing Analysis for ${studentId} (${isLive ? "LIVE" : "DRY RUN"}) ===\n`);

  const config = await loadConfig();
  console.log(`Config: model=${config.model}, minSamples=${config.minSamples}`);

  const mediaDocs = await fetchUnprocessedHandwriting(studentId);
  console.log(`Found ${mediaDocs.length} unprocessed handwritten media docs`);

  if (mediaDocs.length < config.minSamples) {
    console.log(`Skipping: ${mediaDocs.length} < ${config.minSamples} threshold`);
    process.exit(0);
  }

  // Student context
  const studentSnap = await db.collection("students").doc(studentId).get();
  const sd = studentSnap.data();
  const dob = sd.dateOfBirth?.toDate?.() ?? null;
  const student = { displayName: sd.displayName || studentId, dateOfBirth: dob };
  console.log(`Student: ${student.displayName}, DOB: ${dob?.toISOString()?.slice(0, 10) || "unknown"}`);

  // Previous analysis
  const prevSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("writing_analysis").get();
  const previousAnalysis = prevSnap.exists ? prevSnap.data() : null;
  console.log(`Previous analysis: ${previousAnalysis ? "found" : "none"}`);

  // Build prompt
  const now = new Date();
  const promptText = buildBatchWritingPrompt(mediaDocs, student, previousAnalysis, now);

  // Build user content with images
  console.log(`\nDownloading ${mediaDocs.length} images from Storage...`);
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
    userContent.push({ type: "text", text: promptLines.slice(startIdx, nextImageIdx).join("\n").trim() });

    if (doc.storagePath) {
      try {
        const img = await downloadImageAsBase64(doc.storagePath);
        console.log(`  ✓ ${doc.id} (${doc.observedAt.toISOString().slice(0, 10)})`);
        userContent.push(img);
      } catch (err) {
        console.warn(`  ✗ ${doc.id}: ${err.message}`);
        userContent.push({ type: "text", text: `[Image could not be loaded]` });
      }
    }
  }

  // VLM call
  console.log(`\nCalling ${config.model}...`);
  const vlmResult = await runVLMCall(config.systemPrompt, userContent, {
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
  });

  const parsed = parseWritingAnalysisResponse(vlmResult);
  if (!parsed) {
    console.error("Failed to parse VLM response:", vlmResult);
    process.exit(1);
  }

  const age = calculateAge(student.dateOfBirth, now);
  const copiedCount = mediaDocs.filter((d) => d.copied).length;
  const analysisDoc = {
    ...parsed,
    sampleCount: mediaDocs.length,
    copiedCount,
    studentAge: age,
    generatedAt: new Date(),
    sourceMediaIds: mediaDocs.map((d) => d.id),
    model: config.model,
    status: "completed",
  };

  console.log("\n=== RESULT ===\n");
  console.log(JSON.stringify(analysisDoc, null, 2));

  if (isLive) {
    await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("writing_analysis")
      .set(analysisDoc);
    const batch = db.batch();
    for (const doc of mediaDocs) {
      batch.update(db.collection("students").doc(studentId).collection("media").doc(doc.id), {
        batchAnalyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log("\n✓ Written to Firestore and marked media docs");
  } else {
    console.log("\n(dry run — nothing written. Use --live to persist)");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

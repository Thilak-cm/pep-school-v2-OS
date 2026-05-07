import * as functions from "firebase-functions/v1";
import { db, Timestamp, FieldPath } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
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

// -----------------------------------------------
// Student Soul: Generate soul narrative for a single student (PEP-149)
// Replaces the old per-dimension profile system (PEP-124)
// -----------------------------------------------

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
  const docId = `soul_template_${programId}`;

  const cached = soulTemplateCache[docId];
  if (cached?.data && (Date.now() - cached.ts < SOUL_TEMPLATE_CACHE_TTL_MS)) {
    return cached.data;
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", `Soul template not found: ${docId}. Run seed-soul-templates.mjs`);
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

async function callSoulGeneration(observations, interviews, guidelinesContent, studentContext, previousSoul, openAiKey) {
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
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
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
    console.error("[soul] OpenAI error", response.status, errText?.slice?.(0, 400));
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

async function writeSoulAndGuidelines(studentId, soulContent, programId, templateConfig, observationCount, interviewCount, lastObsAt, lastInterviewAt) {
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
  batch.set(soulRef, soulDoc);

  // Write open_questions doc (full overwrite, no archiving)
  const oqDoc = buildOpenQuestionsDoc({ areas: openQuestionAreas, programId });
  oqDoc.updatedAt = now;
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
      templateDocId: `config/soul_template_${programId}`,
    });
    guidelinesDoc.createdAt = now;
    guidelinesDoc.updatedAt = now;
    batch.set(guidelinesRef, guidelinesDoc);
    console.log(`[soul] Seeded guidelines for ${studentId} from soul_template_${programId}`);
  }

  await batch.commit();
}

export const generateStudentProfile = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can generate profiles");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const studentInfo = await getStudentWithProgram(studentId);
    if (!studentInfo.programId || !VALID_PROGRAMS.includes(studentInfo.programId)) {
      throw new functions.https.HttpsError("failed-precondition", `Invalid program: ${studentInfo.programId}`);
    }

    const templateConfig = await getSoulTemplateConfig(studentInfo.programId);

    // Default to 365-day observation window; pass windowDays to override
    const windowDays = data?.windowDays ?? 365;
    const [notes, rawInterviews] = await Promise.all([
      fetchStudentNotesForWindow(studentId, windowDays),
      fetchStudentInterviews(studentId, windowDays),
    ]);

    // Read existing guidelines (if any) to use as the reference lens
    const guidelinesSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("guidelines").get();
    const guidelinesContent = guidelinesSnap.exists
      ? guidelinesSnap.data().content
      : templateConfig.markdown;

    // Read previous soul for continuity
    const prevSoulSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("soul").get();
    const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;

    if (!notes.length && !rawInterviews.length) {
      console.log(`[soul] No observations or interviews for ${studentId}, writing empty soul`);
      await writeSoulAndGuidelines(
        studentId,
        "No observations or interviews available yet.",
        studentInfo.programId,
        templateConfig,
        0, 0, null, null,
      );
      return {
        status: "no_notes",
        studentId,
        programId: studentInfo.programId,
        noteCount: 0,
        interviewCount: 0,
      };
    }

    const formatted = notes.map(formatObservationForPrompt);
    const formattedInterviews = rawInterviews.map(formatInterviewForPrompt);

    // Find latest timestamps for sourceStats
    const lastObsAt = notes.length ? chooseObservationTimestamp(notes[0]) : null;
    const lastInterviewAt = rawInterviews.length && rawInterviews[0].conductedAt
      ? (rawInterviews[0].conductedAt.toDate ? rawInterviews[0].conductedAt.toDate() : new Date(rawInterviews[0].conductedAt))
      : null;

    const soulContent = await callSoulGeneration(
      formatted, formattedInterviews, guidelinesContent,
      { studentName: studentInfo.studentName, dob: studentInfo.dob, age: studentInfo.age, programId: studentInfo.programId },
      previousSoul, openAiKey,
    );

    await writeSoulAndGuidelines(
      studentId, soulContent, studentInfo.programId, templateConfig,
      formatted.length, formattedInterviews.length, lastObsAt, lastInterviewAt,
    );

    // Extract narrative for boolean flags (strip both fenced blocks)
    const { content: withoutYaml } = extractGuidelinesSuggestions(soulContent);
    const { areas: openQuestionAreas, content: narrative } = extractOpenQuestions(withoutYaml);

    const areaKeys = Object.keys(openQuestionAreas);
    const totalQuestions = Object.values(openQuestionAreas).reduce((sum, qs) => sum + qs.length, 0);
    console.log(`[soul] Generated soul for ${studentId}: ${formatted.length} observations, ${formattedInterviews.length} interviews, ${totalQuestions} open questions across ${areaKeys.length} areas`);

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
  });

// -----------------------------------------------
// Student Soul: Bulk backfill for all active students (PEP-149)
// -----------------------------------------------

export const backfillStudentProfiles = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can run backfill");
    }

    const windowDays = data?.windowDays ?? 365;
    const dryRun = data?.dryRun === true;
    const batchSize = Math.min(Number(data?.batchSize) || 10, 25);
    const startAfter = data?.startAfter || null;

    let query = db.collection("students")
      .where("isActive", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(batchSize);

    if (startAfter) {
      const startAfterDoc = await db.collection("students").doc(startAfter).get();
      if (!startAfterDoc.exists) {
        throw new functions.https.HttpsError("not-found", `startAfter student not found: ${startAfter}`);
      }
      query = query.startAfter(startAfterDoc);
    }

    const studentsSnap = await query.get();
    const filteredStudents = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (dryRun) {
      return {
        status: "dry_run",
        studentCount: filteredStudents.length,
        students: filteredStudents.map((s) => ({ id: s.id, name: s.displayName || s.firstName })),
        hasMore: filteredStudents.length === batchSize,
        lastStudentId: filteredStudents.length ? filteredStudents[filteredStudents.length - 1].id : null,
      };
    }

    const results = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (const student of filteredStudents) {
      processed++;
      try {
        const studentInfo = await getStudentWithProgram(student.id);
        if (!studentInfo.programId || !VALID_PROGRAMS.includes(studentInfo.programId)) {
          errors.push({ studentId: student.id, error: `Invalid program: ${studentInfo.programId}` });
          failed++;
          continue;
        }

        const templateConfig = await getSoulTemplateConfig(studentInfo.programId);

        const [notes, rawInterviews] = await Promise.all([
          fetchStudentNotesForWindow(student.id, windowDays),
          fetchStudentInterviews(student.id, windowDays),
        ]);

        // Read existing guidelines + previous soul
        const aiSummariesRef = db.collection("students").doc(student.id).collection("ai_summaries");
        const [guidelinesSnap, prevSoulSnap] = await Promise.all([
          aiSummariesRef.doc("guidelines").get(),
          aiSummariesRef.doc("soul").get(),
        ]);
        const guidelinesContent = guidelinesSnap.exists ? guidelinesSnap.data().content : templateConfig.markdown;
        const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;

        if (!notes.length && !rawInterviews.length) {
          await writeSoulAndGuidelines(
            student.id, "No observations or interviews available yet.",
            studentInfo.programId, templateConfig, 0, 0, null, null,
          );
          succeeded++;
          results.push({ studentId: student.id, status: "no_notes" });
          console.log(`[backfill] ${student.id}: no notes or interviews, wrote empty soul`);
          continue;
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
          previousSoul, openAiKey,
        );

        await writeSoulAndGuidelines(
          student.id, soulContent, studentInfo.programId, templateConfig,
          formatted.length, formattedInterviews.length, lastObsAt, lastInterviewAt,
        );
        succeeded++;
        results.push({ studentId: student.id, status: "ok", noteCount: formatted.length, interviewCount: formattedInterviews.length });
        console.log(`[backfill] ${student.id}: ${formatted.length} notes, ${formattedInterviews.length} interviews`);
      } catch (err) {
        console.error(`[backfill] Failed for ${student.id}:`, err.message);
        errors.push({ studentId: student.id, error: err.message });
        failed++;
      }
    }

    const lastStudentId = filteredStudents.length ? filteredStudents[filteredStudents.length - 1].id : null;
    const hasMore = filteredStudents.length === batchSize;
    console.log(`[backfill] Batch complete: ${succeeded}/${processed} succeeded, ${failed} failed, hasMore=${hasMore}`);
    return { status: "ok", processed, succeeded, failed, errors, results, lastStudentId, hasMore };
  });

// -----------------------------------------------
// Test Bench: Soul generation with caller-supplied prompt (PEP-163)
// -----------------------------------------------

export async function testBenchSoul({ studentId, systemPrompt, guidelinesContent, model, temperature, maxTokens, windowDays, includeInterviews, openAiKey }) {
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
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
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
    throw new functions.https.HttpsError("internal", `AI error: ${response.status} — ${errText?.slice?.(0, 200)}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  return { output: rawContent || "(empty response)", totalTokens };
}

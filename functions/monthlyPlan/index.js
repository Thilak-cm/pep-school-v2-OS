/**
 * PEP-260: Monthly plan production Cloud Function.
 *
 * generateMonthlyPlan — callable CF that gathers student context,
 * calls LLM via OpenRouter, archives the previous plan (if any),
 * and saves the new plan to Firestore.
 */
import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT, OPENROUTER_API_KEY, getOpenRouterKey } from "../shared/openrouter.js";
import { calculateAge } from "../utils/handwritingAnalysisHelpers.js";
import { buildUserPrompt } from "./helpers.js";

// ---------------------------------------------------------------------------
// Config cache (1-day TTL)
// ---------------------------------------------------------------------------
const CONFIG_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
let cachedConfig = null;
let configFetchedAt = 0;

async function getMonthlyPlanConfig() {
  const now = Date.now();
  if (cachedConfig && now - configFetchedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  const snap = await db.collection("config").doc("monthly_plan").get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "config/monthly_plan doc not found — run the seed script first",
    );
  }
  cachedConfig = snap.data();
  configFetchedAt = now;
  return cachedConfig;
}

// ---------------------------------------------------------------------------
// generateMonthlyPlan
// ---------------------------------------------------------------------------
export const generateMonthlyPlan = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY],
  })
  .https.onCall(async (data, context) => {
    // Auth + role gate
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }
    const callerUid = context.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can generate monthly plans");
    }

    const { studentId, targetMonth } = data || {};
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    // 1. Load config
    const config = await getMonthlyPlanConfig();
    const systemPrompt = config.systemPrompt;
    const model = config.model || "gpt-5.4";
    const temperature = config.temperature ?? 0.3;
    const maxTokens = config.max_tokens || 8000;

    // 2. Fetch student doc
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
    }
    const studentData = studentSnap.data();
    const dob = studentData.dateOfBirth?.toDate?.()
      ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
    const now = new Date();
    const age = calculateAge(dob, now);
    const ageStr = age ? `${age.years}y ${age.months}m` : "unknown age";

    // Resolve programId from classroom (student docs don't always have it)
    let programId = studentData.programId || null;
    if (!programId && studentData.classroomId) {
      const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
      if (classroomSnap.exists) {
        programId = classroomSnap.data().programId || null;
      }
    }
    programId = programId || "unknown";

    // Program gate — toddler and primary only
    if (!["toddler", "primary"].includes(programId)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Monthly plans are only available for toddler and primary programs (got: ${programId})`,
      );
    }

    // Resolve target month
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resolvedMonth = targetMonth || `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

    // 3. Fetch observations, media, writing analysis, and preceding plan in parallel
    const fourMonthsAgo = new Date(now);
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

    const studentRef = db.collection("students").doc(studentId);

    const [obsSnap, mediaSnap, writingSnap, precedingPlanSnap, feedbackSnap] = await Promise.all([
      studentRef.collection("observations")
        .where("observedAt", ">=", fourMonthsAgo)
        .orderBy("observedAt", "desc")
        .get(),
      studentRef.collection("media")
        .where("observedAt", ">=", fourMonthsAgo)
        .orderBy("observedAt", "desc")
        .get(),
      studentRef.collection("ai_summaries").doc("writing_analysis").get(),
      studentRef.collection("ai_summaries").doc("monthly_plan").get(),
      studentRef.collection("ai_summaries").doc("monthly_plan")
        .collection("feedback").orderBy("createdAt", "desc").get(),
    ]);

    const observations = obsSnap.docs.map((d) => d.data());
    const mediaDocs = mediaSnap.docs.map((d) => d.data());
    const writingAnalysis = writingSnap.exists ? writingSnap.data() : null;
    const precedingPlan = precedingPlanSnap.exists ? precedingPlanSnap.data() : null;
    const feedback = feedbackSnap.docs.map((d) => d.data());

    // Compute data window
    const allDates = observations
      .map((o) => o.observedAt?.toDate?.() ?? (o.observedAt ? new Date(o.observedAt) : null))
      .filter(Boolean);
    const dataWindowFrom = allDates.length > 0
      ? new Date(Math.min(...allDates)).toISOString().slice(0, 10)
      : fourMonthsAgo.toISOString().slice(0, 10);
    const dataWindowTo = allDates.length > 0
      ? new Date(Math.max(...allDates)).toISOString().slice(0, 10)
      : now.toISOString().slice(0, 10);

    // 4. Build user prompt
    const userPrompt = buildUserPrompt({
      profile: {
        displayName: studentData.displayName || studentId,
        studentId,
        ageStr,
        programId,
        targetMonth: resolvedMonth,
      },
      observations,
      mediaDocs,
      writingAnalysis,
      precedingPlan,
      feedback,
    });

    // 5. Call LLM via OpenRouter
    const apiKey = getOpenRouterKey();
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OPENROUTER_API_KEY not configured");
    }

    const body = buildChatBody({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
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
      console.error("[generateMonthlyPlan] network error", err);
      throw new functions.https.HttpsError("unavailable", "AI service unavailable: " + (err.message || "network error"));
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new functions.https.HttpsError("internal", `LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
    }

    const json = await response.json().catch(() => {
      throw new functions.https.HttpsError("internal", "LLM returned non-JSON response");
    });
    const rawContent = json?.choices?.[0]?.message?.content?.trim();
    const totalTokens = json?.usage?.total_tokens || 0;

    if (!rawContent) {
      throw new functions.https.HttpsError("internal", "LLM returned empty response");
    }

    // 6. Parse LLM response
    let planData;
    try {
      planData = JSON.parse(rawContent);
    } catch (e) { // eslint-disable-line no-unused-vars
      console.error("[generateMonthlyPlan] JSON parse failed:", rawContent.slice(0, 500));
      throw new functions.https.HttpsError("internal", "LLM response is not valid JSON");
    }

    // 7. Archive previous plan (if exists) before overwriting
    const planDocRef = studentRef.collection("ai_summaries").doc("monthly_plan");
    if (precedingPlan && precedingPlan.month) {
      const historyKey = `${precedingPlan.month}_${now.toISOString().replace(/[:.]/g, "-")}`;
      await planDocRef.collection("history").doc(historyKey).set({
        ...precedingPlan,
        archivedAt: now.toISOString(),
        archivedReason: "overwritten by new plan generation",
      });
      console.log(`[generateMonthlyPlan] archived previous plan for ${studentId} (${historyKey})`);
    }

    // 8. Save new plan to active doc
    const planDoc = {
      ...planData,
      // Ensure metadata is set even if LLM omits it
      studentId,
      studentName: studentData.displayName || studentId,
      month: resolvedMonth,
      dataWindow: planData.dataWindow || {
        from: dataWindowFrom,
        to: dataWindowTo,
        observationCount: observations.length,
      },
      // System metadata
      generatedAt: now.toISOString(),
      generatedBy: callerUid,
      generatedByName: callerDoc.data().displayName || callerUid,
      model,
      totalTokens,
      status: "generated",
    };

    await planDocRef.set(planDoc);

    console.log(`[generateMonthlyPlan] ${studentId}: ${observations.length} obs, ${mediaDocs.length} media, ${totalTokens} tokens → ${resolvedMonth}`);

    return {
      success: true,
      studentId,
      month: resolvedMonth,
      plan: planDoc,
    };
  });

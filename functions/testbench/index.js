import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import { OPENROUTER_API_KEY, getOpenRouterKey } from "../shared/openrouter.js";

const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");
import { FRONTIER_MODEL } from "../config/modelConstants.js";
import { getOpenRouterModelId, getModelSupportsJson } from "../config/testBenchModels.js";
import { testBenchSoul } from "../students/soul.js";
import { testBenchHandwriting } from "../ai/handwriting.js";
import { testBenchInterviewTurn } from "./interviewQuestions.js";
import { testBenchMonthlyPlan } from "./monthlyPlan.js";
import { testBenchDigest } from "./digest.js";
import { testBenchReport } from "./report.js";

// -----------------------------------------------
// Test Bench: Run prompt variations for evaluation (PEP-163, PEP-210)
// All LLM calls route through OpenRouter for multi-model support.
// -----------------------------------------------

export const testBenchRun = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const feature = String(data?.feature || "").trim();
    if (!feature) {
      throw new functions.https.HttpsError("invalid-argument", "feature is required");
    }

    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : null;

    if (callerRole !== "superadmin") {
      // Non-superadmins need a testbench/settings/access doc with this feature granted
      const accessSnap = await db.doc(`testbench/settings/access/${context.auth.uid}`).get();
      const allowed = accessSnap.exists ? accessSnap.data().allowedFeatures || [] : [];
      if (!allowed.includes(feature)) {
        throw new functions.https.HttpsError("permission-denied", "You don't have access to this feature");
      }
    }
    const studentId = String(data?.studentId || "").trim();
    const systemPrompt = String(data?.systemPrompt || "").trim();
    const model = String(data?.model || FRONTIER_MODEL).trim();
    const temperature = typeof data?.temperature === "number" ? data.temperature : 0.3;
    const maxTokens = data?.max_tokens || 2000;

    // Digest uses classroomId instead of studentId — skip studentId check
    const isDigest = feature === "digest_generation";
    if (!isDigest && (!studentId || !systemPrompt)) {
      throw new functions.https.HttpsError("invalid-argument", "studentId and systemPrompt are required");
    }
    if (isDigest && !systemPrompt) {
      throw new functions.https.HttpsError("invalid-argument", "systemPrompt is required");
    }

    const apiKey = getOpenRouterKey();
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenRouter key not configured");
    }

    // Resolve local model ID to OpenRouter slug (e.g. "gpt-5.4" → "openai/gpt-5.4-20260305")
    const routerModel = getOpenRouterModelId(model);

    console.log(`[testBench] Running ${feature} for ${studentId}, model=${routerModel}, temp=${temperature}`);

    if (feature === "handwriting_analysis") {
      return await testBenchHandwriting({ studentId, systemPrompt, model: routerModel, temperature, maxTokens, apiKey });
    } else if (feature === "soul_generation") {
      const guidelinesContent = String(data?.guidelinesContent || "").trim();
      const windowDays = data?.windowDays ?? 365;
      const includeInterviews = data?.includeInterviews !== false;
      return await testBenchSoul({ studentId, systemPrompt, guidelinesContent, model: routerModel, temperature, maxTokens, windowDays, includeInterviews, apiKey });
    } else if (feature === "interview_question_gen") {
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      if (messages.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "messages array is required for interview_question_gen");
      }
      const elapsedMinutes = typeof data?.elapsedMinutes === "number" ? data.elapsedMinutes : null;
      const questionCount = typeof data?.questionCount === "number" ? data.questionCount : null;
      const selectedAreas = Array.isArray(data?.selectedAreas) ? data.selectedAreas : [];
      const supportsJsonMode = getModelSupportsJson(model);
      return await testBenchInterviewTurn({ studentId, systemPrompt, messages, model: routerModel, temperature, maxTokens, apiKey, elapsedMinutes, questionCount, selectedAreas, supportsJsonMode });
    } else if (feature === "monthly_plan") {
      return await testBenchMonthlyPlan({ studentId, systemPrompt, model: routerModel, temperature, maxTokens, apiKey });
    } else if (feature === "digest_generation") {
      const classroomId = String(data?.classroomId || "").trim();
      const promptType = String(data?.promptType || "classroom").trim();
      if (promptType === "classroom" && !classroomId) {
        throw new functions.https.HttpsError("invalid-argument", "classroomId is required for classroom prompt type");
      }
      if (promptType === "superadmin" && callerRole !== "superadmin") {
        throw new functions.https.HttpsError("permission-denied", "Executive digest requires superadmin role");
      }
      const enabledTools = Array.isArray(data?.enabledTools) ? data.enabledTools : null;
      return await testBenchDigest({ classroomId, promptType, systemPrompt, model: routerModel, temperature, maxTokens, enabledTools });
    } else if (feature === "report_generation") {
      const reportType = String(data?.reportType || "term").trim();
      const dateRangeStart = data?.dateRangeStart || null;
      const dateRangeEnd = data?.dateRangeEnd || null;
      return await testBenchReport({ studentId, reportType, dateRangeStart, dateRangeEnd, systemPrompt, model: routerModel, temperature, maxTokens, apiKey });
    }

    throw new functions.https.HttpsError("invalid-argument", `Unknown feature: ${feature}`);
  });

import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENROUTER_API_KEY, getOpenRouterKey } from "../shared/openrouter.js";
import { FRONTIER_MODEL, getOpenRouterModelId } from "../config/modelConstants.js";
import { testBenchSoul } from "../students/soul.js";
import { testBenchHandwriting } from "../ai/handwriting.js";
import { testBenchInterviewTurn } from "./interviewQuestions.js";

// -----------------------------------------------
// Test Bench: Run prompt variations for evaluation (PEP-163, PEP-210)
// All LLM calls route through OpenRouter for multi-model support.
// -----------------------------------------------

export const testBenchRun = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENROUTER_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Superadmin access required");
    }

    const feature = String(data?.feature || "").trim();
    const studentId = String(data?.studentId || "").trim();
    const systemPrompt = String(data?.systemPrompt || "").trim();
    const model = String(data?.model || FRONTIER_MODEL).trim();
    const temperature = typeof data?.temperature === "number" ? data.temperature : 0.3;
    const maxTokens = data?.max_tokens || 2000;

    if (!feature || !studentId || !systemPrompt) {
      throw new functions.https.HttpsError("invalid-argument", "feature, studentId, and systemPrompt are required");
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
      return await testBenchInterviewTurn({ studentId, systemPrompt, messages, model: routerModel, temperature, maxTokens, apiKey, elapsedMinutes, questionCount });
    }

    throw new functions.https.HttpsError("invalid-argument", `Unknown feature: ${feature}`);
  });

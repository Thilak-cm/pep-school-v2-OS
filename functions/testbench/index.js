import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey } from "../shared/openai.js";
import { FRONTIER_MODEL } from "../config/modelConstants.js";
import { testBenchSoul } from "../students/soul.js";
import { testBenchHandwriting } from "../ai/handwriting.js";

// -----------------------------------------------
// Test Bench: Run prompt variations for evaluation (PEP-163)
// -----------------------------------------------

export const testBenchRun = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
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

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    console.log(`[testBench] Running ${feature} for ${studentId}, model=${model}, temp=${temperature}`);

    if (feature === "handwriting_analysis") {
      return await testBenchHandwriting({ studentId, systemPrompt, model, temperature, maxTokens, openAiKey });
    } else if (feature === "soul_generation") {
      const guidelinesContent = String(data?.guidelinesContent || "").trim();
      const windowDays = data?.windowDays ?? 365;
      const includeInterviews = data?.includeInterviews !== false;
      return await testBenchSoul({ studentId, systemPrompt, guidelinesContent, model, temperature, maxTokens, windowDays, includeInterviews, openAiKey });
    }

    throw new functions.https.HttpsError("invalid-argument", `Unknown feature: ${feature}`);
  });

import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { runLLM, OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";

// Fallback defaults - used when config doc is missing or lacks model fields
const COACH_MODEL_INFO = { model: "gpt-5.4", temperature: 0, max_tokens: 1000 };

// -----------------------------------------------
// Coach Review (AI nudges) — callable
// -----------------------------------------------

const NUDGE_IDS = Object.freeze(["duration", "modality", "independence", "evidence", "subjective"]);

// In-memory TTL cache for coach prompts (1 day)
const COACH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const coachConfigCache = new Map(); // docId -> { data, ts }

async function getCoachConfigServer(docId, { forceRefresh = false } = {}) {
  if (!docId || typeof docId !== "string") {
    throw new Error("Invalid coach docId");
  }

  // Check cache first
  const cached = coachConfigCache.get(docId);
  const fresh = !forceRefresh && cached && (Date.now() - cached.ts < COACH_CACHE_TTL_MS);
  if (fresh) {
    return cached.data;
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new Error(`Coach config not found in Firestore for doc ${docId}`);
  }

  const data = snap.data() || {};

  // Validate and extract enabled/disabled nudges
  const enabledNudges = Array.isArray(data.enabledNudges)
    ? data.enabledNudges.filter((x) => NUDGE_IDS.includes(x))
    : [];
  const disabledNudges = Array.isArray(data.disabledNudges)
    ? data.disabledNudges.filter((x) => NUDGE_IDS.includes(x))
    : [];

  // Extract nudgeBlocks (object with string values)
  const nudgeBlocks = (data.nudgeBlocks && typeof data.nudgeBlocks === "object")
    ? data.nudgeBlocks
    : {};

  // Extract other fields
  const title = typeof data.title === "string" ? data.title : undefined;
  const description = typeof data.description === "string" ? data.description : undefined;
  const maxReturnNudges = typeof data.maxReturnNudges === "number" ? data.maxReturnNudges : undefined;
  const introBlock = typeof data.introBlock === "string" ? data.introBlock : undefined;
  const finalPrompt = typeof data.finalPrompt === "string" ? data.finalPrompt : undefined;
  const coachFeatureEnable = data.coach_feature_enable === true; // default false

  // Model config from Firestore with fallback to constants (PEP-139)
  const model = data.model || COACH_MODEL_INFO.model;
  const temperature = typeof data.temperature === "number" ? data.temperature : COACH_MODEL_INFO.temperature;
  const max_tokens = Number.isFinite(data.max_tokens) ? data.max_tokens : COACH_MODEL_INFO.max_tokens;

  const result = {
    title,
    description,
    enabledNudges,
    disabledNudges,
    maxReturnNudges,
    nudgeBlocks,
    introBlock,
    finalPrompt,
    coachFeatureEnable,
    model,
    temperature,
    max_tokens,
  };

  // Cache the result
  coachConfigCache.set(docId, { data: result, ts: Date.now() });
  return result;
}

// Callable: Run Coach Review on observation text
export const aiCoachReview = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // minimal logging in production; remove verbose payload logs
    const noteText = String(data?.noteText || "").trim();
    if (!noteText) {
      console.error("[aiCoachReview] noteText is empty or missing");
      throw new functions.https.HttpsError("invalid-argument", "noteText is required");
    }

    try {
      // Determine program routing
      const rawProgramIds = Array.isArray(data?.programIds)
        ? data.programIds
        : (data?.programId ? [data.programId] : []);
      const programIds = Array.from(new Set((rawProgramIds || []).map((x) => String(x || "").trim()).filter(Boolean)));

      // If no program provided - log and skip nudges (client should pass program)
      if (programIds.length === 0) {
        console.error("[aiCoachReview] missing programId/programIds; returning empty nudges");
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // If multiple programs provided (group note across programs) - skip nudges
      if (programIds.length > 1) {
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // Resolve document id by program (no legacy fallback)
      const coachDocId = `coach_${programIds[0]}`;

      // Get coach configuration from Firestore; if missing treat as disabled
      let config;
      try {
        const forceRefresh = !!data?.forceRefresh;
        config = await getCoachConfigServer(coachDocId, { forceRefresh });
      } catch {
        return {
          nudges: [],
          model: COACH_MODEL_INFO.model,
          enabledNudges: [],
          maxReturnNudges: 0,
        };
      }

      // If feature disabled or prompt missing - skip nudges
      if (!config.coachFeatureEnable || !config.finalPrompt) {
        return {
          nudges: [],
          model: config.model,
          enabledNudges: config.enabledNudges,
          maxReturnNudges: config.maxReturnNudges,
        };
      }

      const systemPrompt = config.finalPrompt;

      // Ensure system prompt explicitly mentions JSON when using json_object format
      const enhancedSystemPrompt = systemPrompt.includes("JSON") || systemPrompt.includes("json")
        ? systemPrompt
        : systemPrompt + "\n\nIMPORTANT: You must respond with valid JSON only.";

      const { content: rawContent, resolvedModel } = await runLLM({
        featureId: "coach",
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: noteText },
        ],
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        responseFormat: { type: "json_object" },
        traceName: "coach-review",
        traceMetadata: { programId: programIds[0] },
      });

      // Parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawContent);
      } catch (parseError) {
        console.error("[aiCoachReview] JSON parse error", parseError, "Raw content:", rawContent);
        throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
      }

      // Extract nudges array from response
      const nudges = Array.isArray(parsedResponse.nudges) ? parsedResponse.nudges : [];

      // Apply maxReturnNudges limit if configured
      let limitedNudges = nudges;
      if (config.maxReturnNudges && config.maxReturnNudges > 0) {
        limitedNudges = nudges.slice(0, config.maxReturnNudges);
      }

      return {
        nudges: limitedNudges,
        rawResponse: rawContent,
        model: resolvedModel,
        enabledNudges: config.enabledNudges,
        maxReturnNudges: config.maxReturnNudges,
      };
    } catch (error) {
      console.error("[aiCoachReview] error:", error);

      // Re-throw Firebase Functions errors
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Failed to run coach review: " + (error?.message || "Unknown error"),
      );
    }
  });

import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { runLLM, OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";

// Fallback defaults - used only when Firestore config doc lacks model fields (PEP-139)
const CLEANUP_MODEL_INFO = { model: "gpt-5.4-nano", temperature: 0, max_tokens: 1000 };

// In-memory TTL cache for prompts to reduce Firestore reads
const PROMPT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
let textSummarizerCache = { data: null, ts: 0 };

async function getTextSummarizerPromptsServer({ forceRefresh = false } = {}) {
  const fresh =
    !forceRefresh &&
    textSummarizerCache.data &&
    (Date.now() - textSummarizerCache.ts < PROMPT_TTL_MS);
  if (fresh) return textSummarizerCache.data;

  try {
    const snap = await db.collection("config").doc("text_summarizer").get();
    if (!snap.exists) throw new Error("config/text_summarizer doc not found");
    const data = snap.data() || {};
    if (!data.systemPrompt || !data.userPrompt) {
      throw new Error("config/text_summarizer missing systemPrompt or userPrompt");
    }
    const out = {
      systemPrompt: String(data.systemPrompt),
      userPrompt: String(data.userPrompt),
      version: Number.isFinite(data.version) ? data.version : 1,
      model: data.model || CLEANUP_MODEL_INFO.model,
      temperature: typeof data.temperature === "number" ? data.temperature : CLEANUP_MODEL_INFO.temperature,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : CLEANUP_MODEL_INFO.max_tokens,
    };
    textSummarizerCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    textSummarizerCache = { data: null, ts: 0 };
    console.error("[aiTextCleanup] prompt fetch failed:", err);
    throw err;
  }
}

export const aiTextCleanup = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const text = String(data?.text || "").trim();
    if (!text) {
      throw new functions.https.HttpsError("invalid-argument", "text is required");
    }
    if (text.length > 12000) {
      throw new functions.https.HttpsError("invalid-argument", "text too long");
    }

    const forceRefresh = !!data?.forceRefresh;
    const config = await getTextSummarizerPromptsServer({ forceRefresh });

    const renderedUser = String(config.userPrompt)
      .replaceAll("${" + "text}", text);

    const { content, resolvedModel } = await runLLM({
      featureId: "text_cleanup",
      messages: [
        { role: "system", content: config.systemPrompt || "" },
        { role: "user", content: renderedUser },
      ],
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
      traceName: "text-cleanup",
      traceMetadata: { textLength: text.length, promptVersion: config.version },
    });

    return {
      cleanedText: content,
      model: resolvedModel,
      promptVersion: config.version || 1,
    };
  });

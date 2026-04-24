import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { MINI_MODEL } from "../config/modelConstants.js";

// Fallback defaults — used only when Firestore config doc lacks model fields (PEP-139)
const CLEANUP_MODEL_INFO = { model: MINI_MODEL, temperature: 0, max_tokens: 1000 };

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
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
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

    const body = buildChatBody({
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt || "" },
        { role: "user", content: renderedUser }
      ],
      temperature: config.temperature,
      max_completion_tokens: config.max_tokens,
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
      console.error("[aiTextCleanup] network error", e);
      throw new functions.https.HttpsError("unavailable", "AI service unavailable");
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiTextCleanup] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
    }

    const json = await response.json();
    const cleanedText = json?.choices?.[0]?.message?.content?.trim();
    if (!cleanedText) {
      throw new functions.https.HttpsError("internal", "AI returned no content");
    }

  return {
    cleanedText,
    model: config.model,
    promptVersion: config.version || 1,
  };
});

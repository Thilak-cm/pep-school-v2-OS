import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, base64ToBlob } from "../shared/openai.js";

// -----------------------------------------------
// AI: Whisper STT (server-side OpenAI invocation)
// -----------------------------------------------
const WHISPER_TRANSCRIBE_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_TRANSLATE_ENDPOINT = "https://api.openai.com/v1/audio/translations";
const WHISPER_MODEL_INFO = { model: "whisper-1" };

// TTL cache for voice context prompt
const VOICE_PROMPT_TTL_MS = 5 * 60 * 1000;
let voicePromptCache = { data: null, ts: 0 };

async function getVoiceContextPromptServer({ forceRefresh = false } = {}) {
  const fresh =
    !forceRefresh &&
    voicePromptCache.data &&
    (Date.now() - voicePromptCache.ts < VOICE_PROMPT_TTL_MS);
  if (fresh) return voicePromptCache.data;

  try {
    const snap = await db.collection("config").doc("voice_transcriber").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const contextPrompt = String(
      data.contextPrompt ||
        "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities."
    );
    voicePromptCache = { data: contextPrompt, ts: Date.now() };
    return contextPrompt;
  } catch {
    const fallback =
      "This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities.";
    voicePromptCache = { data: fallback, ts: Date.now() };
    return fallback;
  }
}

// Max payload we allow for callable to avoid request-size limits (approx 9.5MB raw)
const MAX_CALLABLE_BYTES = 9.5 * 1024 * 1024;

export const aiWhisperTranscribe = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    const openAiKey = getOpenAiKey();
    if (!openAiKey) throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");

    const audioBase64 = data?.audioBase64;
    const mimeType = String(data?.mimeType || "audio/mpeg");
    const languageCode = String(data?.languageCode || "en-US");
    if (!audioBase64) throw new functions.https.HttpsError("invalid-argument", "audioBase64 is required");

    const rawBytes = Buffer.byteLength(audioBase64, "base64");
    if (rawBytes > MAX_CALLABLE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "Audio too large; please use a shorter recording");
    }

    const blob = base64ToBlob(audioBase64, mimeType);
    const form = new FormData();
    const filename = `recording_${Date.now()}.mp3`;
    form.append("file", blob, filename);
    form.append("model", WHISPER_MODEL_INFO.model);
    form.append("response_format", "verbose_json"); // Get detected language
    const contextPrompt = await getVoiceContextPromptServer({ forceRefresh: !!data?.forceRefresh });
    form.append("prompt", contextPrompt);
    if (languageCode && languageCode !== "en-US") {
      form.append("language", languageCode.split("-")[0]);
    }

    let response;
    try {
      response = await fetch(WHISPER_TRANSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${openAiKey}` },
        body: form,
      });
    } catch (e) {
      console.error("[aiWhisperTranscribe] network error", e);
      throw new functions.https.HttpsError("unavailable", "STT service unavailable");
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiWhisperTranscribe] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `STT error: ${response.status}`);
    }
    const json = await response.json();
    const text = (json?.text || "").trim();
    const detectedLanguage = json?.language || undefined;
    return { text, languageCode, detectedLanguage };
  });

export const aiWhisperTranslate = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    const openAiKey = getOpenAiKey();
    if (!openAiKey) throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");

    const audioBase64 = data?.audioBase64;
    const mimeType = String(data?.mimeType || "audio/mpeg");
    if (!audioBase64) throw new functions.https.HttpsError("invalid-argument", "audioBase64 is required");

    const rawBytes = Buffer.byteLength(audioBase64, "base64");
    if (rawBytes > MAX_CALLABLE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "Audio too large; please use a shorter recording");
    }

    const blob = base64ToBlob(audioBase64, mimeType);
    const form = new FormData();
    const filename = `recording_${Date.now()}.mp3`;
    form.append("file", blob, filename);
    form.append("model", WHISPER_MODEL_INFO.model);
    form.append("response_format", "verbose_json");
    const contextPrompt = await getVoiceContextPromptServer({ forceRefresh: !!data?.forceRefresh });
    form.append("prompt", contextPrompt);

    let response;
    try {
      response = await fetch(WHISPER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${openAiKey}` },
        body: form,
      });
    } catch (e) {
      console.error("[aiWhisperTranslate] network error", e);
      throw new functions.https.HttpsError("unavailable", "STT service unavailable");
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[aiWhisperTranslate] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `STT error: ${response.status}`);
    }
    const json = await response.json();
    const text = (json?.text || "").trim();
    const language = json?.language || undefined;
    return { text, detectedLanguage: language };
  });

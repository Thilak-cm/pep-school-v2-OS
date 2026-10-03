import * as functions from "firebase-functions/v1";
import { OPENAI_API_KEY, getOpenAiKey, base64ToBlob } from "../shared/openai.js";
import { LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";
import { recordTailTrace, getTraceSampleRate } from "../shared/langfuse.js";

// -----------------------------------------------
// AI: Whisper STT (server-side OpenAI invocation)
// -----------------------------------------------
const WHISPER_TRANSLATE_ENDPOINT = "https://api.openai.com/v1/audio/translations";
const WHISPER_MODEL_INFO = { model: "whisper-1" };

// Whisper context prompt removed in #304: the `prompt` param is decoder
// conditioning (fake "previous transcript"), not an instruction. On silent
// audio the decoder would complete the descriptive prose, echoing it into the
// transcript. Removal makes prompt echo structurally impossible. A vocab-list
// prompt was considered and rejected: the 224-token window can't hold ~500
// student names, and generic Montessori vocabulary is well-represented in
// Whisper training data. The old voice transcriber config doc still exists in
// Firestore but is intentionally unread.

// Hallucination gates on verbose_json segments (#304). Thresholds are the
// reference defaults in OpenAI's transcribe.py and faster-whisper. Strict
// inequalities: boundary values pass. The silence gate requires BOTH signals
// (AND) because silence can hallucinate confidently and noisy real speech can
// score low confidence - either alone gives false positives.
const GATE_NO_SPEECH_PROB = 0.6;
const GATE_AVG_LOGPROB = -1.0;
const GATE_COMPRESSION_RATIO = 2.4;

/**
 * Filter hallucinated segments out of a Whisper verbose_json response (#304).
 * A segment is dropped when (no_speech_prob > 0.6 AND avg_logprob < -1.0)
 * OR compression_ratio > 2.4. Segments with missing/non-numeric scores are
 * kept (we can't prove hallucination). When `segments` is absent, falls back
 * to the top-level text untouched.
 *
 * @param {object} json - Whisper verbose_json response
 * @returns {{ text: string, droppedSegments: Array<{text: string, no_speech_prob: number, avg_logprob: number, compression_ratio: number}> }}
 */
export function extractGatedTranscript(json) {
  const segments = json?.segments;
  if (!Array.isArray(segments)) {
    return { text: String(json?.text || "").trim(), droppedSegments: [] };
  }

  const kept = [];
  const droppedSegments = [];
  for (const segment of segments) {
    const noSpeech = Number(segment?.no_speech_prob);
    const logProb = Number(segment?.avg_logprob);
    const compression = Number(segment?.compression_ratio);

    const silenceGate =
      Number.isFinite(noSpeech) && Number.isFinite(logProb) &&
      noSpeech > GATE_NO_SPEECH_PROB && logProb < GATE_AVG_LOGPROB;
    const repetitionGate =
      Number.isFinite(compression) && compression > GATE_COMPRESSION_RATIO;

    if (silenceGate || repetitionGate) {
      droppedSegments.push({
        text: String(segment?.text || ""),
        no_speech_prob: segment?.no_speech_prob,
        avg_logprob: segment?.avg_logprob,
        compression_ratio: segment?.compression_ratio,
      });
    } else {
      kept.push(String(segment?.text || ""));
    }
  }

  // Whisper segment text carries its own leading space - join raw, then trim.
  return { text: kept.join("").trim(), droppedSegments };
}

// Max payload we allow for callable to avoid request-size limits (approx 9.5MB raw)
const MAX_CALLABLE_BYTES = 9.5 * 1024 * 1024;

// aiWhisperTranscribe removed in #298: dead path (frontend wrapper was unused;
// all voice flows route through aiWhisperTranslate). Removing it also removed
// an authenticated-callable surface and halved the whisper sampling work.

/**
 * Map Whisper's verbose_json duration to Langfuse usageDetails (#298).
 * "audio_seconds" is a contract with the live Langfuse model definition
 * ((?i)^(whisper-1)$ @ $0.0001/audio_second) - the key name must match
 * exactly or whisper cost silently reports zero.
 * @param {object} json - Whisper verbose_json response
 * @returns {{ audio_seconds: number }|undefined}
 */
export function buildWhisperUsageDetails(json) {
  const duration = Number(json?.duration);
  if (!Number.isFinite(duration)) return undefined;
  return { audio_seconds: Math.round(duration) };
}

/**
 * Build the recordExit closure for whisper-translate tail sampling (#298).
 * Extracted so tests can inject deps without calling the full CF.
 *
 * @param {object} opts
 * @param {boolean} opts.tracingEnabled
 * @param {string} opts.mimeType
 * @param {number} opts.rawBytes
 * @param {Date} opts.startTime
 * @param {object} [opts.deps] - Test injection: { recordTailTrace, getTraceSampleRate }
 * @returns {(end: object, options?: { applySampling?: boolean }) => Promise<void>}
 */
export function buildRecordExit({ tracingEnabled, mimeType, rawBytes, startTime, uid, deps = {} }) {
  const record = deps.recordTailTrace || recordTailTrace;
  const getRate = deps.getTraceSampleRate || getTraceSampleRate;

  return async (end, { applySampling = false } = {}) => {
    if (!tracingEnabled) return;
    const sampleRate = applySampling ? await getRate("whisper_translate") : 1;
    await record({
      sampleRate,
      trace: {
        name: "whisper-translate",
        metadata: { mimeType, audioBytes: rawBytes, ...(uid ? { uid } : {}) },
        startTime,
      },
      generation: {
        name: "whisper-translation",
        model: WHISPER_MODEL_INFO.model,
        metadata: { audioBytes: rawBytes, mimeType },
        startTime,
        end: { ...end, endTime: new Date() },
      },
    });
  };
}

export const aiWhisperTranslate = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: [OPENAI_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
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

    // Langfuse tail-based tracing (#187, #298): no objects created before the
    // call. Buffer the payload, capture startTime, and record at each exit -
    // failures unconditionally (level ERROR), successes coin-flipped against
    // config/langfuse_sampling rates.whisper_translate.
    const tracingEnabled = !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
    const recordExit = buildRecordExit({ tracingEnabled, mimeType, rawBytes, startTime: new Date(), uid: context.auth.uid });

    const blob = base64ToBlob(audioBase64, mimeType);
    const form = new FormData();
    const filename = `recording_${Date.now()}.mp3`;
    form.append("file", blob, filename);
    form.append("model", WHISPER_MODEL_INFO.model);
    form.append("response_format", "verbose_json");

    let response;
    try {
      response = await fetch(WHISPER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { "Authorization": `Bearer ${openAiKey}` },
        body: form,
      });
    } catch (e) {
      await recordExit({ output: { error: e.message }, statusMessage: "network_error", level: "ERROR" });
      console.error("[aiWhisperTranslate] network error", e);
      throw new functions.https.HttpsError("unavailable", "STT service unavailable");
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      await recordExit({
        output: { error: errText?.slice?.(0, 300) },
        statusMessage: `http_${response.status}`,
        level: "ERROR",
      });
      console.error("[aiWhisperTranslate] OpenAI error", response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `STT error: ${response.status}`);
    }
    const json = await response.json();
    const { text, droppedSegments } = extractGatedTranscript(json);
    const language = json?.language || undefined;

    // Log dropped segments with all three scores for production threshold
    // tuning (#304) - developers keep the hallucination-vs-empty distinction
    // even though callers only see text: "".
    if (droppedSegments.length > 0) {
      console.log("[aiWhisperTranslate] dropped hallucinated segments", JSON.stringify(droppedSegments));
    }

    await recordExit({
      output: text,
      // usageDetails drives whisper cost in Langfuse (#298) - see
      // buildWhisperUsageDetails for the key-name contract.
      usageDetails: buildWhisperUsageDetails(json),
      metadata: { detectedLanguage: language, textLength: text.length, droppedSegments: droppedSegments.length },
    }, { applySampling: true });

    return { text, detectedLanguage: language };
  });

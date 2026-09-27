import { Langfuse } from "langfuse";
import { db } from "./firebase.js";

const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";

/**
 * Create a configured Langfuse client.
 * Reads LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY from env vars
 * (injected by Firebase defineSecret).
 */
export function createLangfuse() {
  return new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: LANGFUSE_BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// Value-weighted trace sampling (#298)
//
// Why: Langfuse free tier is 50k units/month; text_cleanup + whisper_translate
// alone were ~52% of trace volume with near-zero debug value, while low-volume
// features (reports, digests, coach, chat) must stay at 100%.
//
// Design: TAIL-based sampling - the keep/drop decision happens AFTER the LLM
// call outcome is known (vs the SDK's native head-based sampleRate, which
// would drop failures too). Callers buffer trace/generation payloads during
// the call and invoke recordTailTrace() at each exit. Timestamps are explicit
// parameters (SDK buffers events client-side), so backdating keeps latency
// honest in the UI.
//
// Two-tier capability (which featureIds a config rate actually affects):
//   Tier 1 - sampleable by config alone (runLLM ownTrace path + whisper):
//     text_cleanup, coach, media_pdf, monthly_plan, writing_analysis,
//     soul_generation, whisper_translate
//   Tier 2 - config key is INERT (bespoke root traces, never sampled):
//     digest (x4), chat, reports (x2), structuredLLM roots (baseball_card),
//     testbench. These pipelines create their own root trace and pass it
//     down; nested calls always inherit the parent's decision - sampling
//     them would require buffering whole agent-loop/streaming trees.
//   Configuring a rate for a tier-2 feature does nothing by design.
//
// Config: single doc config/langfuse_sampling { rates: { [featureId]: 0..1 } }.
// Seed via: node scripts/ops/push-langfuse-sampling.mjs --yes
// Default 1.0 on missing doc/key/error (unlike model_registry fail-fast):
// telemetry config must never break a production LLM call.
// ---------------------------------------------------------------------------

const SAMPLING_TTL_MS = 5 * 60 * 1000;

let samplingCache = { data: null, ts: 0 };

/** Default Firestore fetcher - returns doc data or null when missing. */
async function fetchSamplingDocFromFirestore() {
  const snap = await db.collection("config").doc("langfuse_sampling").get();
  return snap.exists ? (snap.data() || {}) : null;
}

/**
 * Invalidate the sampling config cache (for testing or manual refresh).
 */
export function invalidateSamplingCache() {
  samplingCache = { data: null, ts: 0 };
}

/**
 * Get the trace sample rate for a feature. Fail-safe by design: returns 1.0
 * (keep everything) when the doc is missing, the key is missing, the value is
 * invalid, or the Firestore read throws. Never throws.
 *
 * @param {string} featureId - e.g. "text_cleanup", "whisper_translate"
 * @param {object} [options]
 * @param {object} [options.deps] - Test injection: { fetchSamplingDoc }
 * @returns {Promise<number>} rate in [0, 1]; 1.0 = always keep
 */
export async function getTraceSampleRate(featureId, { deps = {} } = {}) {
  const fetchSamplingDoc = deps.fetchSamplingDoc || fetchSamplingDocFromFirestore;

  let data = samplingCache.data;
  const fresh = data !== null && (Date.now() - samplingCache.ts < SAMPLING_TTL_MS);
  if (!fresh) {
    try {
      data = await fetchSamplingDoc();
      // Cache a missing doc as {} (valid state: nothing configured). Failed
      // fetches are NOT cached so the next call retries.
      samplingCache = { data: data || {}, ts: Date.now() };
      data = samplingCache.data;
    } catch (e) {
      console.warn("[langfuse] sampling config read failed, defaulting to 1.0:", e?.message);
      return 1.0;
    }
  }

  const rate = data?.rates?.[featureId];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) {
    return 1.0;
  }
  return rate;
}

/**
 * Tail-based trace recorder (#298). Call once per LLM-call exit, after the
 * outcome is known.
 *
 * Keep policy: generations with level ERROR or WARNING are recorded
 * unconditionally (failures and cap-hits are the debugging signal sampling
 * must never lose); clean successes coin-flip against sampleRate. Sampled-out
 * = zero Langfuse objects created: no client, no events queued, no flush.
 *
 * Never throws into the request path - a telemetry failure must not fail the
 * LLM call it describes.
 *
 * @param {object} options
 * @param {Function} [options.createClient] - Langfuse client factory (test injection)
 * @param {number} [options.sampleRate] - keep probability for clean successes (default 1)
 * @param {Function} [options.rng] - random source (test injection)
 * @param {object} options.trace - { name, metadata, startTime, ...langfuse trace fields }
 * @param {object} options.generation - { name, model, input, metadata, startTime,
 *   end: { output, usage, usageDetails, metadata, level, statusMessage, endTime } }
 * @returns {Promise<boolean>} true if the trace was recorded
 */
export async function recordTailTrace({
  createClient = createLangfuse,
  sampleRate = 1,
  rng = Math.random,
  trace: tracePayload,
  generation: generationPayload,
}) {
  try {
    const { end: endPayload = {}, startTime, ...genFields } = generationPayload || {};
    const level = endPayload.level;
    const alwaysKeep = level === "ERROR" || level === "WARNING";
    if (!alwaysKeep && !(rng() < sampleRate)) {
      return false;
    }

    const client = createClient();
    const { startTime: traceStart, ...traceFields } = tracePayload || {};
    const trace = client.trace({
      ...traceFields,
      // Explicit timestamp backdates the trace to when the call actually
      // started, so recorded-at-exit traces keep honest latency in the UI.
      ...(traceStart ? { timestamp: traceStart } : {}),
    });
    const generation = trace.generation({
      ...genFields,
      ...(startTime ? { startTime } : {}),
    });
    generation.end(endPayload);

    try {
      await client.flushAsync();
    } catch (e) {
      console.warn("[langfuse] tail-trace flush failed:", e?.message);
    }
    return true;
  } catch (e) {
    console.warn("[langfuse] recordTailTrace failed (trace dropped, call unaffected):", e?.message);
    return false;
  }
}

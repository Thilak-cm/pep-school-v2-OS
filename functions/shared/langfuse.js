import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseClient } from "@langfuse/client";
import { startObservation, propagateAttributes } from "@langfuse/tracing";
import { db } from "./firebase.js";

// ---------------------------------------------------------------------------
// Module-level OTEL initialisation (v6 migration, #319)
//
// Why module-level: Firebase Cloud Functions reuse containers across
// invocations. One SDK + processor pair per container avoids cold-start
// overhead on every request. exportMode "immediate" is required for
// serverless - batched mode risks losing spans when the container freezes.
//
// The processor reads LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, and
// LANGFUSE_BASE_URL from env vars (injected by Firebase defineSecret).
// If keys are missing at import time (e.g. during tests), the processor
// initialises silently and spans are dropped - tracing must never break
// production code.
// ---------------------------------------------------------------------------

const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";

let _spanProcessor = null;
let _sdkStarted = false;

/**
 * Lazily initialise the OTEL SDK + Langfuse span processor.
 * Lazy because defineSecret values may not be available at module load in
 * all deployment paths (emulator, test runner). Once started, the SDK
 * stays alive for the container lifetime.
 */
function ensureSDK() {
  if (_sdkStarted) return _spanProcessor;
  _spanProcessor = new LangfuseSpanProcessor({
    baseUrl: LANGFUSE_BASE_URL,
    exportMode: "immediate",
  });
  const sdk = new NodeSDK({ spanProcessors: [_spanProcessor] });
  sdk.start();
  _sdkStarted = true;
  return _spanProcessor;
}

/**
 * Get the Langfuse span processor for flushing.
 * Callers use this in finally blocks: `await getSpanProcessor().forceFlush()`.
 * Returns null when tracing is disabled (missing keys).
 */
export function getSpanProcessor() {
  if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
    return null;
  }
  return ensureSDK();
}

/**
 * Create a LangfuseClient for score ingestion (reports) and other
 * non-tracing API calls.
 */
export function createScoreClient() {
  return new LangfuseClient({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: LANGFUSE_BASE_URL,
  });
}

/**
 * Check whether Langfuse tracing credentials are available.
 * Used by callers to skip span creation when keys are missing.
 */
export function isTracingEnabled() {
  return !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
}

/**
 * Flush the span processor. Safe to call even when tracing is disabled.
 * Never throws - a telemetry flush failure must not break production code.
 */
export async function flushTracing() {
  try {
    const proc = getSpanProcessor();
    if (proc) await proc.forceFlush();
  } catch (e) {
    console.warn("[langfuse] tracing flush failed:", e?.message);
  }
}

// Re-export tracing primitives so callers import from one place.
// This keeps the migration's blast radius contained: feature files import
// from "./langfuse.js" (unchanged), not from three new packages.
export { startObservation, propagateAttributes };

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
// parameters so backdating keeps latency honest in the UI.
//
// Two-tier capability (which featureIds a config rate actually affects):
//   Tier 1 - sampleable by config alone (runLLM ownTrace path + whisper):
//     text_cleanup, coach, media_pdf, monthly_plan, writing_analysis,
//     soul_generation, whisper_translate, baseline_judge, readiness
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
 * Tail-based trace recorder (#298, v6 migration #319).
 *
 * Call once per LLM-call exit, after the outcome is known.
 *
 * Keep policy: generations with level ERROR or WARNING are recorded
 * unconditionally (failures and cap-hits are the debugging signal sampling
 * must never lose); clean successes coin-flip against sampleRate. Sampled-out
 * = zero OTEL spans created: no processor work, no export, no flush.
 *
 * Never throws into the request path - a telemetry failure must not fail the
 * LLM call it describes.
 *
 * @param {object} options
 * @param {number} [options.sampleRate] - keep probability for clean successes (default 1)
 * @param {Function} [options.rng] - random source (test injection)
 * @param {object} options.trace - { name, metadata, startTime, tags }
 * @param {object} options.generation - { name, model, input, metadata, startTime,
 *   end: { output, usageDetails, metadata, level, statusMessage, endTime } }
 * @param {object} [options.deps] - Test injection: { isTracingEnabled, getSpanProcessor, startObservation, propagateAttributes }
 * @returns {Promise<boolean>} true if the trace was recorded
 */
export async function recordTailTrace({
  sampleRate = 1,
  rng = Math.random,
  trace: tracePayload,
  generation: generationPayload,
  deps = {},
}) {
  try {
    const _isTracingEnabled = deps.isTracingEnabled || isTracingEnabled;
    const _getSpanProcessor = deps.getSpanProcessor || getSpanProcessor;
    const _startObservation = deps.startObservation || startObservation;
    const _propagateAttributes = deps.propagateAttributes || propagateAttributes;

    if (!_isTracingEnabled()) return false;

    const { end: endPayload = {}, startTime: genStartTime, ...genFields } = generationPayload || {};
    const level = endPayload.level;
    const alwaysKeep = level === "ERROR" || level === "WARNING";
    if (!alwaysKeep && !(rng() < sampleRate)) {
      return false;
    }

    // Ensure the OTEL SDK is running before creating spans.
    _getSpanProcessor();

    const { startTime: traceStart, name: traceName, metadata: traceMeta, tags, ...restTrace } = tracePayload || {};

    // Build the root span. propagateAttributes sets trace-level attributes
    // (tags, metadata, traceName) that Langfuse uses for filtering/grouping.
    // The root span is the "trace" equivalent in v6.
    const propagateParams = {
      ...(traceName ? { traceName } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(traceMeta ? { metadata: traceMeta } : {}),
      ...(restTrace.userId ? { userId: restTrace.userId } : {}),
      ...(restTrace.sessionId ? { sessionId: restTrace.sessionId } : {}),
    };

    const rootSpan = _startObservation(traceName || "tail-trace", {
      ...(traceMeta ? { metadata: traceMeta } : {}),
    }, {
      ...(traceStart ? { startTime: traceStart } : {}),
    });

    // Set trace-level attrs via propagateAttributes on the root span's context.
    // This is a sync call that decorates the current span in context.
    if (Object.keys(propagateParams).length > 0) {
      _propagateAttributes(propagateParams, () => {
        // Generation span as a child of the root.
        const gen = rootSpan.startObservation(genFields.name || "generation", {
          model: genFields.model,
          input: genFields.input,
          metadata: genFields.metadata,
        }, {
          asType: "generation",
          ...(genStartTime ? { startTime: genStartTime } : {}),
        });

        // Merge end-payload metadata into the generation and close it.
        const { metadata: endMeta, endTime: genEndTime, ...endRest } = endPayload;
        gen.update({
          ...endRest,
          ...(endMeta ? { metadata: { ...genFields.metadata, ...endMeta } } : {}),
        }).end(genEndTime || new Date());

        rootSpan.end(genEndTime || new Date());
      });
    } else {
      // No propagation params - create generation directly.
      const gen = rootSpan.startObservation(genFields.name || "generation", {
        model: genFields.model,
        input: genFields.input,
        metadata: genFields.metadata,
      }, {
        asType: "generation",
        ...(genStartTime ? { startTime: genStartTime } : {}),
      });

      const { metadata: endMeta, endTime: genEndTime, ...endRest } = endPayload;
      gen.update({
        ...endRest,
        ...(endMeta ? { metadata: { ...genFields.metadata, ...endMeta } } : {}),
      }).end(genEndTime || new Date());

      rootSpan.end(genEndTime || new Date());
    }

    try {
      const proc = _getSpanProcessor();
      if (proc) await proc.forceFlush();
    } catch (e) {
      console.warn("[langfuse] tail-trace flush failed:", e?.message);
    }
    return true;
  } catch (e) {
    console.warn("[langfuse] recordTailTrace failed (trace dropped, call unaffected):", e?.message);
    return false;
  }
}

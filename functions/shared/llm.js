/**
 * Shared traced LLM helper (#187).
 *
 * Single entry point for all non-streaming production LLM calls.
 * Handles: model resolution (via registry), OpenRouter API call,
 * Langfuse generation tracing (with resolved model from response headers),
 * and error mapping to Firebase HttpsError.
 *
 * Chat streaming (openrouterStream.js) and agentLoop.js keep their own
 * call paths and adopt resolveModel() directly.
 */

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { resolveModel } from "./modelRegistry.js";
import {
  recordTailTrace as defaultRecordTailTrace,
  getTraceSampleRate as defaultGetTraceSampleRate,
  createLangfuse as defaultCreateLangfuse,
} from "./langfuse.js";
import { fetchWithTimeout } from "./http.js";

export const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");
export const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
export const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Max plain re-rolls after a provider error (finish_reason "error"), so max
 * 3 calls total (#310). Hardcoded, mirroring structuredLLM's W38 rationale:
 * transient upstream failures clear within a re-roll or two; 3 consecutive
 * provider errors = sustained outage where more in-process retries would just
 * replay the failure - fail loudly into Pub/Sub redelivery instead.
 */
const MAX_PROVIDER_RETRIES = 2;

/**
 * Returns true if the model is a reasoning model that does not support
 * temperature, top_p, frequency_penalty, or presence_penalty.
 * GPT-5 base/mini/nano are reasoning models; gpt-5-chat-* variants are not.
 */
export function isReasoningModel(model) {
  if (!model) return false;
  // Strip vendor prefix for OpenRouter slugs (e.g. "openai/gpt-5.4" -> "gpt-5.4")
  const m = model.toLowerCase().replace(/^[^/]+\//, "");
  // o-series reasoning models
  if (/^o[13]/.test(m)) return true;
  // GPT-5 family (but NOT gpt-5-chat variants which support temperature)
  if (m.startsWith("gpt-5") && !m.includes("-chat")) return true;
  return false;
}

/**
 * Map raw OpenRouter usage into Langfuse usageDetails shape (#319).
 * Langfuse expects { input, output, total } for cost computation, plus
 * optional extra buckets (reasoningTokens, cacheReadTokens) for visibility.
 */
export function mapUsageDetails(usage) {
  if (!usage) return undefined;
  const details = {};
  if (Number.isFinite(usage.prompt_tokens)) details.input = usage.prompt_tokens;
  if (Number.isFinite(usage.completion_tokens)) details.output = usage.completion_tokens;
  if (Number.isFinite(usage.total_tokens)) details.total = usage.total_tokens;
  if (Number.isFinite(usage.completion_tokens_details?.reasoning_tokens)) {
    details.reasoningTokens = usage.completion_tokens_details.reasoning_tokens;
  }
  if (Number.isFinite(usage.prompt_tokens_details?.cached_tokens)) {
    details.cacheReadTokens = usage.prompt_tokens_details.cached_tokens;
  }
  return Object.keys(details).length ? details : undefined;
}

/**
 * Strip data-URIs from message content for Langfuse trace input (#319).
 * Replaces inline base64 payloads with a placeholder showing mime type and
 * approximate size. Does NOT mutate the original array - returns a new one.
 * The actual request body sent to OpenRouter is never sanitized.
 */
export function sanitizeMessagesForTrace(messages) {
  if (!messages || messages.length === 0) return [];
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        const url = part?.image_url?.url;
        if (typeof url !== "string" || !url.startsWith("data:")) return part;
        // Extract mime type and compute approximate byte size from base64 length
        const semicolonIdx = url.indexOf(";");
        const commaIdx = url.indexOf(",");
        const mime = semicolonIdx > 5 ? url.slice(5, semicolonIdx) : "unknown";
        const base64Len = commaIdx > 0 ? url.length - commaIdx - 1 : 0;
        const sizeKB = Math.round((base64Len * 3) / 4 / 1024);
        return {
          ...part,
          image_url: {
            ...part.image_url,
            url: `[stripped: ${mime}, ${sizeKB}KB]`,
          },
        };
      }),
    };
  });
}

/**
 * Build a request body for the OpenAI-compatible Chat Completions API.
 * Automatically strips unsupported parameters for reasoning models.
 */
export function buildChatBody({ model, messages, temperature, max_completion_tokens, response_format, stream }) {
  const body = { model, messages };
  if (max_completion_tokens != null) body.max_completion_tokens = max_completion_tokens;
  if (stream) body.stream = true;
  if (response_format) body.response_format = response_format;

  // Only include temperature for non-reasoning models
  if (!isReasoningModel(model) && temperature != null) {
    body.temperature = temperature;
  }
  return body;
}

/**
 * Run a traced LLM call through OpenRouter with model registry resolution.
 *
 * @param {object} options
 * @param {string} options.featureId - Registry feature key (e.g. "coach", "text_cleanup")
 * @param {Array} options.messages - Chat completion messages array
 * @param {string} options.model - Model alias from config (e.g. "gpt-5.4") or full slug
 * @param {number} [options.temperature] - Temperature (stripped for reasoning models)
 * @param {number} [options.maxTokens] - Max completion tokens
 * @param {object} [options.responseFormat] - Response format (e.g. { type: "json_object" })
 * @param {string} [options.traceName] - Langfuse trace name (defaults to featureId)
 * @param {object} [options.traceMetadata] - Additional metadata for the Langfuse trace
 * @param {string[]} [options.traceTags] - Langfuse trace tags (own-trace path only;
 *   on the nested path the parent trace owns its tags). Used to distinguish run
 *   provenance, e.g. "run:scheduled" vs "run:remediation" - see #167 follow-up.
 * @param {object} [options.generationMetadata] - Additional metadata for the Langfuse generation
 * @param {object} [options.trace] - Existing Langfuse trace to nest under (skips trace creation)
 * @param {number} [options.timeoutMs] - Abort the OpenRouter fetch after this many ms (#288).
 *   No default by design: the entry point owns its CF budget and passes this down
 *   (background workers only - interactive onCall failures are already user-visible).
 *   Timeout aborts throw "unavailable" (transient), so fan-out workers rethrow -> redelivery.
 * @param {object} [options.deps] - Test injection: { recordTailTrace, getTraceSampleRate, createLangfuse }
 * @returns {Promise<{content: string, usage: object, resolvedModel: string, responseModel: string|null, finishReason: string|null}>}
 */
export async function runLLM({
  featureId,
  messages,
  model,
  temperature,
  maxTokens,
  responseFormat,
  traceName,
  traceMetadata,
  traceTags,
  generationMetadata,
  trace,
  timeoutMs,
  deps = {},
}) {
  const recordTailTrace = deps.recordTailTrace || defaultRecordTailTrace;
  const getTraceSampleRate = deps.getTraceSampleRate || defaultGetTraceSampleRate;
  const createLangfuse = deps.createLangfuse || defaultCreateLangfuse;

  // 1. Resolve model through registry - once, OUTSIDE the retry loop (#310):
  // "identical request" means the same body bytes; re-resolving mid-retry
  // could silently switch models between attempts and muddy attempt comparison.
  const resolvedModel = await resolveModel(featureId, model);

  // 2. Build request body (also once - reused verbatim by every attempt)
  const body = buildChatBody({
    model: resolvedModel,
    messages,
    temperature,
    max_completion_tokens: maxTokens,
    response_format: responseFormat,
  });

  // 3. Get API key
  const apiKey = process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY.value?.() || null;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OPENROUTER_API_KEY not configured");
  }

  const tracingEnabled = !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);

  const sanitizedInput = sanitizeMessagesForTrace(messages);

  // Retry harness state (#310). activeTrace starts as the caller's trace (or
  // null on the own-trace path) and may be lazily promoted to a real trace on
  // the first provider error. langfuse is non-null only when WE created that
  // promoted client - then we own the flush (events queue on the creating
  // client; structuredLLM idiom).
  let activeTrace = trace || null;
  let langfuse = null;

  /**
   * One LLM attempt - exactly the pre-#310 runLLM body. Two tracing modes:
   *
   * Nested path (activeTrace set): generation is created upfront on the
   * trace and NEVER sampled - the trace owner made the keep/drop decision
   * for the whole tree, and sampling a child would mutilate it. Trace owner
   * owns the flush.
   *
   * Own-trace path (#298): NO Langfuse objects are created before the call.
   * We capture startTime and buffer the payload; each exit routes through
   * recordTailTrace, which keeps failures/cap-hits unconditionally and
   * coin-flips clean successes against the feature's configured rate.
   * Exception (#310): a provider-error exit does NOT hit the recorder - it
   * returns the buffered generation payload so the harness can replay it
   * onto the promoted trace (ERROR = unconditional keep, so the tail
   * sampler's coin-flip is moot the moment a retry starts).
   *
   * @param {number} attempt - 0-based attempt index, tagged on the generation
   *   so per-pipeline provider-error rates are analyzable in Langfuse.
   * @param {boolean} inRetryContext - true when the harness knows this call
   *   is part of a retry sequence (attempt > 0 OR a prior attempt triggered
   *   trace promotion). Controls whether `attempt` is tagged on generation
   *   metadata - AC4 requires non-retry paths to produce byte-identical
   *   metadata to pre-#310 ({ featureId, requestedModel, ...generationMetadata }).
   * @returns {Promise<object>} { providerError: false, value } on success, or
   *   { providerError: true, buffered } after a finish_reason "error" exit.
   */
  const attemptLLM = async (attempt, inRetryContext) => {
    const startTime = new Date();
    // AC4 byte-identity (#310): only tag `attempt` on generations that are part
    // of a retry sequence. Clean single-call successes, timeouts, cap-hits, and
    // all structuredLLM calls must produce metadata identical to pre-#310 output.
    const attemptGenMetadata = {
      featureId, requestedModel: model, ...generationMetadata,
      ...(inRetryContext ? { attempt } : {}),
    };

    const generation = (tracingEnabled && activeTrace)
      ? activeTrace.generation({
        name: `${featureId}-completion`,
        model: resolvedModel,
        input: sanitizedInput,
        metadata: attemptGenMetadata,
      })
      : null;

    /**
     * Record one call exit. Nested: end the upfront generation. Own-trace:
     * hand the buffered payload to the tail recorder. Non-clean exits
     * (level set) skip the rate lookup - they are kept unconditionally.
     */
    const recordExit = async (end) => {
      if (!tracingEnabled) return;
      if (activeTrace) {
        generation?.end(end);
        return;
      }
      const sampleRate = end.level ? 1 : await getTraceSampleRate(featureId);
      await recordTailTrace({
        sampleRate,
        trace: {
          name: traceName || featureId,
          metadata: { featureId, requestedModel: model, resolvedModel, ...traceMetadata },
          ...(traceTags?.length ? { tags: traceTags } : {}),
          startTime,
        },
        generation: {
          name: `${featureId}-completion`,
          model: resolvedModel,
          input: sanitizedInput,
          metadata: attemptGenMetadata,
          startTime,
          end: { ...end, endTime: new Date() },
        },
      });
    };

    // 5. Call OpenRouter
    let response;
    try {
      response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, timeoutMs);
    } catch (err) {
      // Timeout abort (#288): distinct classification so a hang is visible in
      // logs + Langfuse instead of dying as an opaque CF platform timeout.
      if (err.name === "AbortError") {
        await recordExit({
          output: { error: `timeout after ${timeoutMs}ms` },
          statusMessage: "timeout",
          level: "ERROR",
        });
        console.error(`[runLLM:${featureId}] request timed out after ${timeoutMs}ms`);
        throw new functions.https.HttpsError(
          "unavailable", `AI request timed out after ${timeoutMs}ms`,
        );
      }
      await recordExit({
        output: { error: err.message },
        statusMessage: "network_error",
        level: "ERROR",
      });
      console.error(`[runLLM:${featureId}] network error`, err);
      throw new functions.https.HttpsError("unavailable", "AI service unavailable");
    }

    // 6. Capture response model from headers (strategy #2: detect silent swaps)
    const responseModel = response.headers?.get?.("x-model") || null;

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      await recordExit({
        output: { error: errText?.slice?.(0, 300) },
        statusMessage: `http_${response.status}`,
        level: "ERROR",
      });
      console.error(`[runLLM:${featureId}] API error`, response.status, errText?.slice?.(0, 300));
      throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
    }

    // 7. Parse response
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content?.trim();
    const usage = json?.usage || null;
    // finish_reason "length" = output truncated at max_completion_tokens. Surfaced
    // so callers (runStructuredLLM) can treat cap-hits as degenerate generations
    // (W38 RCA: 1500/1500 tokens = derailed output, never a legit long summary).
    const finishReason = json?.choices?.[0]?.finish_reason || null;

    // Provider error (#310): upstream died mid-generation after the 200 was
    // sent. Partial content is never acceptable output for any runLLM caller,
    // so this is recorded as ERROR and handed to the retry harness - never
    // returned as success. Checked BEFORE the empty-content check: an early
    // provider death can return error + empty content, and the provider error
    // is the root cause either way. Usage is kept when present so retry cost
    // analysis stays honest (3 attempts ~ 3x spend).
    if (finishReason === "error") {
      const end = {
        output: content || { error: "provider_error" },
        statusMessage: "provider_error",
        level: "ERROR",
        ...(usage ? { usageDetails: mapUsageDetails(usage) } : {}),
        // Langfuse merges end-metadata into create-metadata server-side, so
        // injecting `attempt` here tags the generation even on the nested path
        // where create-time metadata was committed before the error was known.
        // Satisfies AC2 ("tagged with attempt index") for all attempt-0 exits.
        metadata: { responseModel, finishReason, attempt },
      };
      if (activeTrace) {
        await recordExit(end);
        return { providerError: true, buffered: null };
      }
      // Own-trace path: bypass the tail recorder and buffer the generation so
      // the harness can replay it onto the promoted trace.
      return {
        providerError: true,
        buffered: {
          traceStartTime: startTime,
          create: {
            name: `${featureId}-completion`,
            model: resolvedModel,
            input: messages,
            metadata: attemptGenMetadata,
            startTime,
          },
          end: { ...end, endTime: new Date() },
        },
      };
    }

    if (!content) {
      await recordExit({
        output: { error: "empty_content" },
        statusMessage: "empty_response",
        level: "ERROR",
      });
      throw new functions.https.HttpsError("internal", "AI returned no content");
    }

    // 8. Complete Langfuse generation with usage and response model.
    // Cap-hit success = WARNING (W38 signal): kept unconditionally by the
    // recorder so sampling never hides degenerate generations.
    await recordExit({
      output: content,
      ...(finishReason === "length" ? { level: "WARNING" } : {}),
      ...(usage ? { usageDetails: mapUsageDetails(usage) } : {}),
      metadata: {
        responseModel,
        finishReason,
        ...(responseModel && responseModel !== resolvedModel
          ? { modelDrift: true, driftFrom: resolvedModel, driftTo: responseModel }
          : {}),
      },
    });

    return { providerError: false, value: { content, usage, resolvedModel, responseModel, finishReason } };
  };

  // Retry loop (#310): plain re-roll of the identical body, no backoff -
  // OpenRouter can route the retry to a different upstream instance
  // immediately, CF wall-clock is the scarce resource, and Pub/Sub redelivery
  // IS the delayed layer after exhaustion. NOT a repair retry: a provider
  // error is not the model's mistake, so the partial output carries no
  // corrective signal (that failure class belongs to runStructuredLLM).
  // inRetryContext tracks whether the harness has entered retry mode. Starts
  // false; set true after the first provider error. Controls attempt-tag
  // injection (AC4 byte-identity: non-retry generations must not carry it).
  let inRetryContext = false;
  try {
    for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt++) {
      const result = await attemptLLM(attempt, inRetryContext);
      if (!result.providerError) return result.value;

      // From this point on, every subsequent attempt is in a retry context.
      inRetryContext = true;

      console.warn(
        `[runLLM:${featureId}] provider error (finish_reason=error) on attempt ${attempt}`,
      );
      // Own-trace path, first provider error: promote to a real trace so all
      // attempts nest under one trace. Subsequent attempts take the nested
      // path against it. Inject `attempt: 0` into the buffered generation's
      // metadata - it was built without the tag (inRetryContext was false) but
      // now belongs to a retry sequence.
      if (tracingEnabled && !activeTrace && result.buffered) {
        langfuse = createLangfuse();
        activeTrace = langfuse.trace({
          name: traceName || featureId,
          metadata: { featureId, requestedModel: model, resolvedModel, ...traceMetadata },
          ...(traceTags?.length ? { tags: traceTags } : {}),
          startTime: result.buffered.traceStartTime,
        });
        const promoted = {
          ...result.buffered.create,
          metadata: { ...result.buffered.create.metadata, attempt: 0 },
        };
        activeTrace.generation(promoted).end(result.buffered.end);
      }
    }
  } finally {
    if (langfuse) {
      try {
        await langfuse.flushAsync();
      } catch (e) {
        console.warn("[runLLM] Langfuse flush failed:", e?.message);
      }
    }
  }

  // Sustained provider outage: transport-class, so "unavailable" - fan-out
  // workers NACK it -> Pub/Sub redelivery minutes later (#288's layer, the
  // right medicine for an outage). "internal" would mark work items
  // permanently failed.
  console.error(
    `[runLLM:${featureId}] provider error persisted after ${MAX_PROVIDER_RETRIES + 1} attempts`,
  );
  throw new functions.https.HttpsError(
    "unavailable",
    `AI provider error persisted after ${MAX_PROVIDER_RETRIES + 1} attempts`,
  );
}

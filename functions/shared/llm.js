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
} from "./langfuse.js";
import { fetchWithTimeout } from "./http.js";

export const OPENROUTER_API_KEY = defineSecret("OPENROUTER_API_KEY");
export const LANGFUSE_SECRET_KEY = defineSecret("LANGFUSE_SECRET_KEY");
export const LANGFUSE_PUBLIC_KEY = defineSecret("LANGFUSE_PUBLIC_KEY");

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
 * @param {object} [options.generationMetadata] - Additional metadata for the Langfuse generation
 * @param {object} [options.trace] - Existing Langfuse trace to nest under (skips trace creation)
 * @param {number} [options.timeoutMs] - Abort the OpenRouter fetch after this many ms (#288).
 *   No default by design: the entry point owns its CF budget and passes this down
 *   (background workers only - interactive onCall failures are already user-visible).
 *   Timeout aborts throw "unavailable" (transient), so fan-out workers rethrow -> redelivery.
 * @param {object} [options.deps] - Test injection: { recordTailTrace, getTraceSampleRate }
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
  generationMetadata,
  trace,
  timeoutMs,
  deps = {},
}) {
  const recordTailTrace = deps.recordTailTrace || defaultRecordTailTrace;
  const getTraceSampleRate = deps.getTraceSampleRate || defaultGetTraceSampleRate;

  // 1. Resolve model through registry
  const resolvedModel = await resolveModel(featureId, model);

  // 2. Build request body
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

  // 4. Set up Langfuse tracing (#298: tail-based on the own-trace path).
  //
  // Nested path (trace passed in): generation is created upfront on the
  // parent's trace and NEVER sampled - the parent made the keep/drop decision
  // for the whole tree, and sampling a child would mutilate it. Parent owns
  // the flush (events queue on the client that created the trace).
  //
  // Own-trace path: NO Langfuse objects are created before the call. We
  // capture startTime and buffer the payload; each exit routes through
  // recordTailTrace, which keeps failures/cap-hits unconditionally and
  // coin-flips clean successes against the feature's configured rate.
  const tracingEnabled = !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
  const activeTrace = trace || null;
  const startTime = new Date();

  const sanitizedInput = sanitizeMessagesForTrace(messages);

  const generation = (tracingEnabled && activeTrace)
    ? activeTrace.generation({
      name: `${featureId}-completion`,
      model: resolvedModel,
      input: sanitizedInput,
      metadata: { featureId, requestedModel: model, ...generationMetadata },
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
        startTime,
      },
      generation: {
        name: `${featureId}-completion`,
        model: resolvedModel,
        input: sanitizedInput,
        metadata: { featureId, requestedModel: model, ...generationMetadata },
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

  return { content, usage, resolvedModel, responseModel, finishReason };
}

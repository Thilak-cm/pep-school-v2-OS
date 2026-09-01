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
import { createLangfuse } from "./langfuse.js";

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
 * @returns {Promise<{content: string, usage: object, resolvedModel: string, responseModel: string|null}>}
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
}) {
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

  // 4. Set up Langfuse tracing
  let langfuse = null;
  let ownTrace = null;
  const activeTrace = trace || null;

  if (process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
    langfuse = createLangfuse();
    if (!activeTrace) {
      ownTrace = langfuse.trace({
        name: traceName || featureId,
        metadata: { featureId, requestedModel: model, resolvedModel, ...traceMetadata },
      });
    }
  }

  const traceRef = activeTrace || ownTrace;
  const generation = traceRef?.generation({
    name: `${featureId}-completion`,
    model: resolvedModel,
    input: messages,
    metadata: { featureId, requestedModel: model, ...generationMetadata },
  });

  // 5. Call OpenRouter
  let response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    generation?.end({ output: { error: err.message }, statusMessage: "network_error" });
    await flushLangfuse(langfuse);
    console.error(`[runLLM:${featureId}] network error`, err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  // 6. Capture response model from headers (strategy #2: detect silent swaps)
  const responseModel = response.headers?.get?.("x-model") || null;

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    generation?.end({
      output: { error: errText?.slice?.(0, 300) },
      statusMessage: `http_${response.status}`,
    });
    await flushLangfuse(langfuse);
    console.error(`[runLLM:${featureId}] API error`, response.status, errText?.slice?.(0, 300));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  // 7. Parse response
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content?.trim();
  const usage = json?.usage || null;

  if (!content) {
    generation?.end({ output: { error: "empty_content" }, statusMessage: "empty_response" });
    await flushLangfuse(langfuse);
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  // 8. Complete Langfuse generation with usage and response model
  generation?.end({
    output: content,
    usage: usage ? {
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
      total: usage.total_tokens,
    } : undefined,
    metadata: {
      responseModel,
      ...(responseModel && responseModel !== resolvedModel
        ? { modelDrift: true, driftFrom: resolvedModel, driftTo: responseModel }
        : {}),
    },
  });

  await flushLangfuse(langfuse);

  return { content, usage, resolvedModel, responseModel };
}

/**
 * Flush Langfuse if it was created by this call (not passed in).
 */
async function flushLangfuse(langfuse) {
  if (langfuse) {
    try {
      await langfuse.flushAsync();
    } catch (e) {
      console.warn("[runLLM] Langfuse flush failed:", e?.message);
    }
  }
}

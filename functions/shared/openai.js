import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const getOpenAiKey = () => process.env.OPENAI_API_KEY || OPENAI_API_KEY.value() || null;

const CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * Returns true if the model is a reasoning model that does not support
 * temperature, top_p, frequency_penalty, or presence_penalty.
 * GPT-5 base/mini/nano are reasoning models; gpt-5-chat-* variants are not.
 */
function isReasoningModel(model) {
  if (!model) return false;
  const m = model.toLowerCase();
  // o-series reasoning models
  if (/^o[13]/.test(m)) return true;
  // GPT-5 family (but NOT gpt-5-chat variants which support temperature)
  if (m.startsWith("gpt-5") && !m.includes("-chat")) return true;
  return false;
}

/**
 * Build a request body for the OpenAI Chat Completions API.
 * Automatically strips unsupported parameters for reasoning models.
 */
function buildChatBody({ model, messages, temperature, max_completion_tokens, response_format, stream }) {
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

async function runChatCompletion(messages, modelInfo) {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildChatBody({
        model: modelInfo.model,
        messages,
        temperature: modelInfo.temperature,
        max_completion_tokens: modelInfo.max_tokens,
      })),
    });
  } catch (err) {
    console.error("[runChatCompletion] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[runChatCompletion] OpenAI error", response.status, errText?.slice?.(0, 300));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }
  return content;
}

function base64ToBlob(base64, mimeType = "application/octet-stream") {
  const buf = Buffer.from(base64, "base64");
  return new Blob([buf], { type: mimeType });
}

export {
  OPENAI_API_KEY,
  getOpenAiKey,
  CHAT_ENDPOINT,
  isReasoningModel,
  buildChatBody,
  runChatCompletion,
  base64ToBlob,
};

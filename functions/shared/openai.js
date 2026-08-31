/**
 * Direct OpenAI API helpers - whisper STT only (#187).
 *
 * All chat completion calls now route through shared/llm.js (OpenRouter).
 * This file retains only the OPENAI_API_KEY secret and helpers needed by
 * functions/ai/whisper.js for direct-OpenAI audio endpoints.
 */

import { defineSecret } from "firebase-functions/params";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const getOpenAiKey = () => process.env.OPENAI_API_KEY || OPENAI_API_KEY.value() || null;

function base64ToBlob(base64, mimeType = "application/octet-stream") {
  const buf = Buffer.from(base64, "base64");
  return new Blob([buf], { type: mimeType });
}

export {
  OPENAI_API_KEY,
  getOpenAiKey,
  base64ToBlob,
};

/**
 * OpenRouter API helpers for the test bench (PEP-210).
 *
 * OpenRouter provides an OpenAI-compatible API, so we reuse buildChatBody
 * from openai.js. Only the endpoint URL and API key differ.
 */
import { OPENROUTER_API_KEY } from "./llm.js";

export const getOpenRouterKey = () =>
  process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY.value?.() || null;

export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

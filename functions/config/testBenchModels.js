// Test bench model catalogue — all providers routed through OpenRouter (PEP-210).
// Production config editors use AVAILABLE_MODELS from modelConstants.js (OpenAI only).

import { AVAILABLE_MODELS } from "./modelConstants.js";

export const TEST_BENCH_MODELS = [
  // Include all production OpenAI models
  ...AVAILABLE_MODELS,
  // Google Gemini
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "mini", provider: "Google", openRouterId: "google/gemini-2.5-flash", supportsJsonMode: true },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "frontier", provider: "Google", openRouterId: "google/gemini-2.5-pro", supportsJsonMode: true },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", tier: "frontier", provider: "Google", openRouterId: "google/gemini-3.1-pro-preview-20260219", supportsJsonMode: true },
  // Anthropic Claude
  { id: "claude-opus-4.6", label: "Claude Opus 4.6", tier: "frontier", provider: "Anthropic", openRouterId: "anthropic/claude-4.6-opus-20260205", supportsJsonMode: false },
  { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", tier: "frontier", provider: "Anthropic", openRouterId: "anthropic/claude-4.6-sonnet-20260217", supportsJsonMode: false },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "mini", provider: "Anthropic", openRouterId: "anthropic/claude-4.5-haiku-20251001", supportsJsonMode: false },
  // Meta Llama
  { id: "llama-4-scout", label: "Llama 4 Scout", tier: "mini", provider: "Meta", openRouterId: "meta-llama/llama-4-scout-17b-16e-instruct", supportsJsonMode: false },
  { id: "llama-4-maverick", label: "Llama 4 Maverick", tier: "frontier", provider: "Meta", openRouterId: "meta-llama/llama-4-maverick-17b-128e-instruct", supportsJsonMode: false },
  // Mistral
  { id: "mistral-medium-3.1", label: "Mistral Medium 3.1", tier: "frontier", provider: "Mistral", openRouterId: "mistralai/mistral-medium-3.1", supportsJsonMode: true },
  { id: "mistral-small-3.2", label: "Mistral Small 3.2", tier: "mini", provider: "Mistral", openRouterId: "mistralai/mistral-small-3.2-24b-instruct-2506", supportsJsonMode: true },
  // DeepSeek
  { id: "deepseek-r1", label: "DeepSeek R1", tier: "frontier", provider: "DeepSeek", openRouterId: "deepseek/deepseek-r1-0528", supportsJsonMode: false },
  { id: "deepseek-v3.2", label: "DeepSeek V3.2", tier: "frontier", provider: "DeepSeek", openRouterId: "deepseek/deepseek-v3.2-20251201", supportsJsonMode: true },
];

/**
 * Look up the OpenRouter model slug for a given local model ID.
 * Returns the openRouterId if found, otherwise returns the input as-is
 * (allows passing OpenRouter slugs directly).
 */
export function getOpenRouterModelId(modelId) {
  const entry = TEST_BENCH_MODELS.find((m) => m.id === modelId);
  return entry?.openRouterId || modelId;
}

/**
 * Check whether a model supports JSON response_format.
 */
export function getModelSupportsJson(modelId) {
  const entry = TEST_BENCH_MODELS.find((m) => m.id === modelId);
  return entry?.supportsJsonMode ?? true;
}

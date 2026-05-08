// Consolidated model defaults for all AI features

// Frontier model — used by Coach, Chat, Reports, Profiles
export const FRONTIER_MODEL = "gpt-5.4";

// Mini model — used by Cleanup, Baseball Cards, PDF processing, Chat name generation
export const MINI_MODEL = "gpt-5.4-mini";

// Nano model — available for lightweight tasks
export const NANO_MODEL = "gpt-5.4-nano";

// Available models for config editor dropdowns and test bench.
// Test bench routes all calls through OpenRouter — openRouterId is the API model slug.
export const AVAILABLE_MODELS = [
  // OpenAI
  { id: "gpt-5.4", label: "GPT-5.4", tier: "frontier", provider: "OpenAI", openRouterId: "openai/gpt-5.4-20260305", supportsJsonMode: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", tier: "mini", provider: "OpenAI", openRouterId: "openai/gpt-5.4-mini-20260317", supportsJsonMode: true },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", tier: "mini", provider: "OpenAI", openRouterId: "openai/gpt-5.4-nano-20260317", supportsJsonMode: true },
  { id: "gpt-5.3-instant", label: "GPT-5.3 Instant", tier: "frontier", provider: "OpenAI", openRouterId: "openai/gpt-5.2-20251211", supportsJsonMode: true },
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
  const entry = AVAILABLE_MODELS.find((m) => m.id === modelId);
  return entry?.openRouterId || modelId;
}

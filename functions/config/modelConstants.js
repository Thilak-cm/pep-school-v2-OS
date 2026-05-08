// Consolidated model defaults for all AI features

// Frontier model — used by Coach, Chat, Reports, Profiles
export const FRONTIER_MODEL = "gpt-5.4";

// Mini model — used by Cleanup, Baseball Cards, PDF processing, Chat name generation
export const MINI_MODEL = "gpt-5.4-mini";

// Nano model — available for lightweight tasks
export const NANO_MODEL = "gpt-5.4-nano";

// Available models for production config editor dropdowns (OpenAI only).
// For the full multi-provider test bench catalogue, see testBenchModels.js.
export const AVAILABLE_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (Latest frontier)", tier: "frontier", provider: "OpenAI", openRouterId: "openai/gpt-5.4-20260305", supportsJsonMode: true },
  { id: "gpt-5.3-instant", label: "GPT-5.3 Instant (Fast frontier)", tier: "frontier", provider: "OpenAI", openRouterId: "openai/gpt-5.2-20251211", supportsJsonMode: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (Fast/cheap)", tier: "mini", provider: "OpenAI", openRouterId: "openai/gpt-5.4-mini-20260317", supportsJsonMode: true },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (Fastest/cheapest)", tier: "mini", provider: "OpenAI", openRouterId: "openai/gpt-5.4-nano-20260317", supportsJsonMode: true },
];

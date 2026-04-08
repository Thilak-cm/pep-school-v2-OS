// Consolidated OpenAI model defaults for all AI features

// Frontier model — used by Coach, Chat, Reports, Profiles
export const FRONTIER_MODEL = "gpt-5.4";

// Mini model — used by Cleanup, Baseball Cards, PDF processing, Chat name generation
export const MINI_MODEL = "gpt-5.4-mini";

// Available models for config editor dropdowns (GPT-5.4 family)
export const AVAILABLE_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (Latest frontier)", tier: "frontier" },
  { id: "gpt-5.3-instant", label: "GPT-5.3 Instant (Fast frontier)", tier: "frontier" },
  { id: "gpt-5.2", label: "GPT-5.2 (Previous frontier)", tier: "frontier" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (Fast/cheap)", tier: "mini" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (Fastest/cheapest)", tier: "mini" },
];

// Consolidated OpenAI model defaults for all AI features

// Frontier model — used by Coach, Chat, Reports
export const FRONTIER_MODEL = "gpt-5.2";

// Mini model — used by Cleanup, Baseball Cards, PDF processing, Chat name generation
export const MINI_MODEL = "gpt-5-mini";

// Available models for config editor dropdowns (all GPT-5 family)
export const AVAILABLE_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (Latest frontier)", tier: "frontier" },
  { id: "gpt-5.2", label: "GPT-5.2 (Previous frontier)", tier: "frontier" },
  { id: "gpt-5", label: "GPT-5 (Reasoning/coding)", tier: "frontier" },
  { id: "gpt-5-mini", label: "GPT-5 Mini (Fast/cheap)", tier: "mini" },
  { id: "gpt-5-nano", label: "GPT-5 Nano (Fastest/cheapest)", tier: "mini" },
];

/**
 * Frontend model registry (#187).
 *
 * Static list of model aliases available for admin config editors.
 * These are display-only labels for the admin UI dropdowns - the actual
 * model resolution (alias -> OpenRouter slug) happens server-side via
 * the model registry in Firestore (config/model_registry).
 */

export const AVAILABLE_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4 (Frontier)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (Fast)" },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (Fastest)" },
  { id: "gpt-5-mini", label: "GPT-5 Mini (Legacy)" },
];

// Fallback defaults for editors when config doc lacks fields
export const CLEANUP_MODEL_INFO = { model: "gpt-5.4-nano", temperature: 0, max_tokens: 1000 };

import { FRONTIER_MODEL } from "../../../functions/config/modelConstants.js";
import { TEST_BENCH_MODELS } from "../../../functions/config/testBenchModels.js";

// Group models by provider for the dropdown
const PROVIDER_ORDER = ["OpenAI", "Google", "Anthropic", "Meta", "Mistral", "DeepSeek"];
export const MODELS_BY_PROVIDER = PROVIDER_ORDER
  .map((p) => ({ provider: p, models: TEST_BENCH_MODELS.filter((m) => m.provider === p) }))
  .filter((g) => g.models.length > 0);

export const SCROLL_AFTER = 4; // columns become fixed-width and scroll after this count

export function createVariant(config, idx) {
  return {
    name: `Variant ${String.fromCharCode(65 + (idx || 0))}`,
    systemPrompt: config?.systemPrompt || "",
    guidelinesContent: config?.guidelinesContent || "",
    model: config?.model || FRONTIER_MODEL,
    temperature: config?.temperature ?? 0.3,
    max_tokens: config?.max_tokens || 2000,
    output: null,
    outputMeta: null,
    error: null,
    loading: false,
    rating: 5,
    notes: "",
    dirty: false,
  };
}

export function updateVariant(variants, idx, field, value) {
  return variants.map((v, i) => i === idx ? { ...v, [field]: value, dirty: true } : v);
}

export function hasUnsavedWork(variants) {
  return variants.some((v) => v.dirty || v.output);
}

export { FRONTIER_MODEL, TEST_BENCH_MODELS };

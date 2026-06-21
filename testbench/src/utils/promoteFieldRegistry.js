/**
 * Client-side field registry for the Promote-to-Live dialog (PEP-326).
 *
 * Maps each testbench featureId to human-readable labels and metadata
 * for the confirmation diff UI. This mirrors the server-side promoteFieldMap.js
 * but is purely for display — the CF owns validation and field mapping.
 */

const PROMOTABLE_FIELDS = {
  handwriting_analysis: {
    requiresProgramId: true,
    requiresPromptType: false,
    fields: [
      { key: "systemPrompt", label: "System Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
    ],
  },

  soul_generation: {
    requiresProgramId: true,
    requiresPromptType: false,
    fields: [
      { key: "systemPrompt", label: "System Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
      { key: "guidelinesContent", label: "Guidelines Template (markdown)", type: "string", warnIfFromStudent: true },
    ],
  },

  interview_question_gen: {
    requiresProgramId: false,
    requiresPromptType: false,
    fields: [
      { key: "systemPrompt", label: "System Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
    ],
  },

  monthly_plan: {
    requiresProgramId: false,
    requiresPromptType: false,
    fields: [
      { key: "systemPrompt", label: "System Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
    ],
  },

  digest_generation: {
    requiresProgramId: false,
    requiresPromptType: true,
    fields: [
      { key: "systemPrompt", label: "Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
    ],
  },

  report_generation: {
    requiresProgramId: true,
    requiresPromptType: true,
    fields: [
      { key: "systemPrompt", label: "System Prompt", type: "string" },
      { key: "model", label: "Model", type: "string" },
      { key: "temperature", label: "Temperature", type: "number" },
      { key: "max_tokens", label: "Max Tokens", type: "number" },
    ],
  },
};

/**
 * Get the promotable field definitions for a feature.
 * @param {string} featureId
 * @returns {{ fields: Array, requiresProgramId: boolean, requiresPromptType: boolean }}
 * @throws if featureId is unknown
 */
export function getPromotableFields(featureId) {
  const entry = PROMOTABLE_FIELDS[featureId];
  if (!entry) {
    throw new Error(`Unknown featureId: ${featureId}`);
  }
  return entry;
}

/**
 * Build the diff between live config and variant config for the promote dialog.
 * Returns an array of field comparisons for display.
 *
 * @param {string} featureId
 * @param {object} liveConfig — current Firestore config values
 * @param {object} variantConfig — the variant's config values
 * @returns {Array<{ key: string, label: string, liveValue: any, variantValue: any, changed: boolean, warnIfFromStudent?: boolean }>}
 */
export function buildFieldDiff(featureId, liveConfig, variantConfig) {
  const { fields } = getPromotableFields(featureId);
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    liveValue: liveConfig?.[f.key] ?? null,
    variantValue: variantConfig?.[f.key] ?? null,
    changed: liveConfig?.[f.key] !== variantConfig?.[f.key],
    ...(f.warnIfFromStudent ? { warnIfFromStudent: true } : {}),
  }));
}

export { PROMOTABLE_FIELDS };

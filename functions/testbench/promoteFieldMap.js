/**
 * Field mapping registry for testbench → Firestore config promotion (PEP-326).
 *
 * Maps each testbench featureId to:
 *   - target config doc path(s)
 *   - promotable field names (with optional rename rules)
 *   - validation requirements (programId, promptType)
 */

const PROMOTE_MAP = {
  handwriting_analysis: {
    requiresProgramId: true,
    requiresPromptType: false,
    targets: (programId) => [
      {
        docPath: `config/writing_analysis_${programId}`,
        fields: {
          systemPrompt: "systemPrompt",
          model: "model",
          temperature: "temperature",
          max_tokens: "max_tokens",
        },
      },
    ],
  },

  soul_generation: {
    requiresProgramId: true,
    requiresPromptType: false,
    targets: (programId) => [
      {
        docPath: "config/soul_generation",
        fields: {
          systemPrompt: "systemPrompt",
          model: "model",
          temperature: "temperature",
          max_tokens: "max_tokens",
        },
      },
      {
        docPath: `config/soul_guidelines_${programId}`,
        fields: {
          guidelinesContent: "markdown",
        },
      },
    ],
  },

  interview_question_gen: {
    requiresProgramId: false,
    requiresPromptType: false,
    targets: () => [
      {
        docPath: "config/interview_question_gen",
        fields: {
          systemPrompt: "systemPrompt",
          model: "model",
          temperature: "temperature",
          max_tokens: "max_tokens",
        },
      },
    ],
  },

  monthly_plan: {
    requiresProgramId: false,
    requiresPromptType: false,
    targets: () => [
      {
        docPath: "config/monthly_plan",
        fields: {
          systemPrompt: "systemPrompt",
          model: "model",
          temperature: "temperature",
          max_tokens: "max_tokens",
        },
      },
    ],
  },

  digest_generation: {
    requiresProgramId: false,
    requiresPromptType: true,
    targets: (_programId, promptType) => [
      {
        docPath: "config/weekly_digest",
        fields: {
          systemPrompt: promptType === "superadmin" ? "superadminPrompt" : "classroomPrompt",
          model: "model",
          temperature: "temperature",
          max_tokens: "max_tokens",
        },
      },
    ],
  },
};

const VALID_FEATURE_IDS = Object.keys(PROMOTE_MAP);
const VALID_PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];
const VALID_PROMPT_TYPES = ["classroom", "superadmin"];
const MAX_HISTORY_ENTRIES = 10;

export {
  PROMOTE_MAP,
  VALID_FEATURE_IDS,
  VALID_PROGRAMS,
  VALID_PROMPT_TYPES,
  MAX_HISTORY_ENTRIES,
};

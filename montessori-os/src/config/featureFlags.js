// Central flag to control temporary UI affordances.
// Toggle to false when you want to revert to base UI.
// Central registry of feature-tag badges. Add new keys here and
// reference by name via <FeatureTag flag="yourKey" />.
export const FEATURE_TAGS = {
  voiceToText: true,
};

export const isFeatureTagEnabled = (key) => !!FEATURE_TAGS[key];

// Back-compat alias for direct import consumers (optional)
export const NEW_FEATURE_VOICE_TO_TEXT_BADGE = FEATURE_TAGS.voiceToText;

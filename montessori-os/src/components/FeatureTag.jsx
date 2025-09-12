import React from 'react';
import NewFeaturePill from './NewFeaturePill';
import { isFeatureTagEnabled } from '../config/featureFlags';

/**
 * FeatureTag
 * Lightweight wrapper to show a NewFeaturePill only when a given flag is enabled.
 *
 * Props:
 *  - flag: string | boolean — key in FEATURE_TAGS, or a literal boolean
 *  - label, showIcon, size, sx — forwarded to NewFeaturePill
 */
const FeatureTag = ({ flag, label = 'New Feature', showIcon = true, size = 'sm', sx = {} }) => {
  const enabled = typeof flag === 'boolean' ? flag : isFeatureTagEnabled(flag);
  if (!enabled) return null;
  return <NewFeaturePill label={label} showIcon={showIcon} size={size} sx={sx} />;
};

export default FeatureTag;


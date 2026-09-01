/**
 * Pure helpers for the push-model-registry script (#187).
 *
 * Firebase-free so they can be unit tested directly (node --test)
 * without Admin SDK init side effects. Same pattern as push-brain.helpers.mjs.
 */

import { readFileSync } from "node:fs";

// Every production LLM feature must have an entry in the registry.
export const REQUIRED_FEATURES = [
  "text_cleanup",
  "coach",
  "baseball_card",
  "writing_analysis",
  "photo_classification",
  "media_pdf",
  "chat",
  "soul_generation",
  "monthly_plan",
  "weekly_digest",
  "report",
  "baseline_judge",
  "readiness",
];

/**
 * Read and parse the model registry JSON file.
 * Throws on missing file or invalid JSON.
 */
export function readRegistryFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

/**
 * Validate that a slug looks like an OpenRouter model identifier.
 * Must contain exactly one "/" separating vendor from model name.
 * Examples: "openai/gpt-5.4", "openai/gpt-4.1-mini", "anthropic/claude-4.6-sonnet"
 */
export function isValidSlug(slug) {
  if (typeof slug !== "string") return false;
  const parts = slug.split("/");
  if (parts.length !== 2) return false;
  if (!parts[0] || !parts[1]) return false;
  // No whitespace
  if (/\s/.test(slug)) return false;
  return true;
}

/**
 * Validate the full registry object. Returns an array of error strings.
 * Empty array means valid.
 */
export function validateRegistry(registry) {
  const errors = [];

  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    errors.push("Registry must be a plain object");
    return errors;
  }

  // Check all required features are present
  const featureKeys = Object.keys(registry).filter((k) => !k.startsWith("_"));
  for (const feature of REQUIRED_FEATURES) {
    if (!featureKeys.includes(feature)) {
      errors.push(`Missing required feature: ${feature}`);
    }
  }

  // Check for unexpected features
  for (const key of featureKeys) {
    if (!REQUIRED_FEATURES.includes(key)) {
      errors.push(`Unknown feature: ${key} (not in REQUIRED_FEATURES)`);
    }
  }

  // Validate each feature's alias map
  for (const feature of featureKeys) {
    const aliasMap = registry[feature];
    if (!aliasMap || typeof aliasMap !== "object" || Array.isArray(aliasMap)) {
      errors.push(`${feature}: must be an object mapping aliases to slugs`);
      continue;
    }

    const aliases = Object.keys(aliasMap);
    if (aliases.length === 0) {
      errors.push(`${feature}: must have at least one alias`);
      continue;
    }

    for (const alias of aliases) {
      const slug = aliasMap[alias];
      if (!isValidSlug(slug)) {
        errors.push(`${feature}.${alias}: invalid slug "${slug}" (must be "vendor/model")`);
      }
    }
  }

  return errors;
}

/**
 * Compute the diff between local registry and remote Firestore data.
 * Returns { added, changed, removed, unchanged } arrays of feature IDs.
 *
 * @param {object} local  - The local registry (feature → alias map)
 * @param {object|null} remote - The remote registry from Firestore, or null if doc doesn't exist
 */
export function diffRegistry(local, remote) {
  const localFeatures = Object.keys(local).filter((k) => !k.startsWith("_"));
  const remoteFeatures = remote
    ? Object.keys(remote).filter((k) => !k.startsWith("_"))
    : [];

  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];

  for (const feature of localFeatures) {
    if (!remoteFeatures.includes(feature)) {
      added.push(feature);
    } else if (JSON.stringify(local[feature]) !== JSON.stringify(remote[feature])) {
      changed.push(feature);
    } else {
      unchanged.push(feature);
    }
  }

  for (const feature of remoteFeatures) {
    if (!localFeatures.includes(feature)) {
      removed.push(feature);
    }
  }

  return { added, changed, removed, unchanged };
}

/**
 * Format a diff summary for terminal display.
 */
export function formatDiffSummary(diff) {
  const lines = [];
  if (diff.added.length) {
    lines.push(`  + Added (${diff.added.length}): ${diff.added.join(", ")}`);
  }
  if (diff.changed.length) {
    lines.push(`  ~ Changed (${diff.changed.length}): ${diff.changed.join(", ")}`);
  }
  if (diff.removed.length) {
    lines.push(`  - Removed (${diff.removed.length}): ${diff.removed.join(", ")}`);
  }
  if (diff.unchanged.length) {
    lines.push(`  = Unchanged (${diff.unchanged.length}): ${diff.unchanged.join(", ")}`);
  }
  if (!lines.length) {
    lines.push("  (no features found)");
  }
  return lines.join("\n");
}

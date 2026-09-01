/**
 * Central model registry resolver (#187).
 *
 * Reads config/model_registry from Firestore (5-min TTL cache) and resolves
 * (featureId, alias) to an OpenRouter slug. Fail-fast: throws if the registry
 * doc is missing - no embedded fallback (see issue #187 Decisions Made).
 */

import { db } from "./firebase.js";

const REGISTRY_TTL_MS = 5 * 60 * 1000;

let registryCache = { data: null, ts: 0 };

/**
 * Load the model registry with TTL caching.
 * @returns {Promise<object>} The registry data
 */
async function loadRegistry() {
  if (registryCache.data && (Date.now() - registryCache.ts < REGISTRY_TTL_MS)) {
    return registryCache.data;
  }

  const snap = await db.collection("config").doc("model_registry").get();
  if (!snap.exists) {
    throw new Error(
      "model-registry-missing: config/model_registry does not exist in Firestore. " +
      "Run: node scripts/ops/push-model-registry.mjs --yes",
    );
  }

  const data = snap.data();
  registryCache = { data, ts: Date.now() };
  return data;
}

/**
 * Resolve a model alias to an OpenRouter slug for a given feature.
 *
 * Resolution order:
 *   1. If alias contains "/", it's already a full slug - pass through.
 *   2. Look up registry[featureId][alias].
 *   3. Fall back to registry[featureId]["default"].
 *   4. Throw if nothing found.
 *
 * @param {string} featureId - e.g. "coach", "text_cleanup", "media_pdf"
 * @param {string} alias - e.g. "gpt-5.4", "gpt-5.4-nano", or "openai/gpt-5.4" (pass-through)
 * @returns {Promise<string>} The resolved OpenRouter slug
 */
export async function resolveModel(featureId, alias) {
  // Pass-through: already a full slug (contains vendor prefix)
  if (alias && alias.includes("/")) {
    return alias;
  }

  const registry = await loadRegistry();
  const featureMap = registry[featureId];

  if (!featureMap || typeof featureMap !== "object") {
    throw new Error(
      `model-not-in-registry: feature "${featureId}" not found in model registry`,
    );
  }

  // Exact alias lookup
  if (alias && featureMap[alias]) {
    return featureMap[alias];
  }

  // Fall back to "default"
  if (featureMap.default) {
    return featureMap.default;
  }

  throw new Error(
    `model-not-in-registry: alias "${alias}" not found for feature "${featureId}" ` +
    `(available: ${Object.keys(featureMap).join(", ")})`,
  );
}

/**
 * Invalidate the registry cache (for testing or manual refresh).
 */
export function invalidateRegistryCache() {
  registryCache = { data: null, ts: 0 };
}

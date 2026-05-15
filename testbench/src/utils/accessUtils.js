import { ACTIVE_FEATURES } from "./featureRegistry.js";

/**
 * Check whether a user can access the test bench at all.
 * Superadmins always can; teachers can if they have an access doc with at least one feature.
 */
export function canAccessTestBench(role, accessDoc) {
  if (role === "superadmin") return true;
  if (role !== "teacher" && role !== "classroomadmin") return false;
  if (!accessDoc || !Array.isArray(accessDoc.allowedFeatures)) return false;
  return accessDoc.allowedFeatures.length > 0;
}

/**
 * Check whether a user has access to a specific feature.
 * Superadmins have access to all features.
 */
export function hasFeatureAccess(featureId, role, allowedFeatures) {
  if (role === "superadmin") return true;
  if (!Array.isArray(allowedFeatures)) return false;
  return allowedFeatures.includes(featureId);
}

/**
 * Filter the active features list based on user role and allowed features.
 * Superadmins see all active features; teachers see only their granted features.
 */
export function filterFeaturesByAccess(role, allowedFeatures) {
  if (role === "superadmin") return ACTIVE_FEATURES;
  if (!Array.isArray(allowedFeatures)) return [];
  return ACTIVE_FEATURES.filter((f) => allowedFeatures.includes(f.id));
}

/**
 * Build the Firestore access document shape for writing to testbench_access/{uid}.
 */
export function buildAccessDoc(allowedFeatures, grantedByUid) {
  return {
    allowedFeatures: allowedFeatures || [],
    grantedBy: grantedByUid,
    updatedAt: new Date(),
  };
}

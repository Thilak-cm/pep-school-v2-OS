// Allowed email domains for user onboarding.
//
// Single source of truth - consumed by the backend auth gate
// (functions/auth/index.js), the frontend invite form (UsersAccessPage.jsx),
// and admin scripts. Previously this list was duplicated in four places and
// one copy (scripts/admin/create-user.js) had silently diverged.
//
// Decision (2026-10-02): kept as a deploy-time constant rather than a
// Firestore config doc. The list changes ~1-2x/year, so hot-reloadability
// buys little, while a runtime read would add a failure mode to an auth
// gate (fail-open vs fail-closed), require a firestore.rules change so the
// frontend could read it, and lose the git audit trail on a security
// boundary. Revisit if school onboarding cadence increases.
export const ALLOWED_EMAIL_DOMAINS = [
  "@pepschoolv2.com",
  "@ribbons.education",
  "@accelschool.in",
];

/**
 * Shared predicate so frontend and backend cannot drift on matching logic.
 * @param {string} email - Raw email input (any casing/whitespace).
 * @return {boolean} True when the email ends with an allowed domain.
 */
export function isAllowedEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
}

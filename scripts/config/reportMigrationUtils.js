/**
 * Pure utility for PEP-105 report prompt migration logic.
 * No Firebase dependencies — safe to import from tests and frontend.
 */

/**
 * Build the migration payload for a single document's data.
 * Pure function — no Firebase dependencies. Returns:
 *   { status: "skip"|"migrate", payload?, reason?, warning? }
 *
 * When status is "migrate", `payload` contains the plain fields to write
 * (without FieldValue sentinels — the caller adds those).
 */
export function buildMigrationPayload(data) {
  if (!data) {
    return { status: "skip", reason: "no-data" };
  }

  if (data.staticSystemPrompt !== undefined) {
    return { status: "skip", reason: "already-migrated" };
  }

  const warning =
    !data.systemPrompt && data.systemPrompt !== ""
      ? "no systemPrompt field — setting empty staticSystemPrompt"
      : undefined;

  return {
    status: "migrate",
    payload: {
      staticSystemPrompt: data.systemPrompt || "",
      dynamicSystemPrompt: "",
    },
    warning,
  };
}

/**
 * Digest agent tools — thin re-export from shared tool registry (PEP-304).
 *
 * Preserved for backward compatibility with digest/index.js imports.
 * All tool definitions and executors now live in shared/toolRegistry.js.
 */

import {
  getTools,
  getToolDefinitions,
  createToolExecutor as createRegistryExecutor,
} from "../shared/toolRegistry.js";

// All 8 student tools — the digest agent's default set
const ALL_DIGEST_TOOL_IDS = [
  "fetch_weekly_snapshot",
  "fetch_snapshot_history",
  "fetch_soul",
  "fetch_monthly_plan",
  "fetch_writing_analysis",
  "fetch_interviews",
  "fetch_observations",
  "fetch_media",
];

const digestTools = getTools(ALL_DIGEST_TOOL_IDS, ["student"]);

/** OpenAI-format tool definitions for the agent loop */
export const DIGEST_TOOLS = getToolDefinitions(digestTools);

/**
 * ToolGatekeeper — kept for backward compat but no longer needed.
 * Prerequisite enforcement is now built into the registry executor.
 */
export class ToolGatekeeper {
  constructor() { this.snapshotFetched = new Set(); }
  recordSnapshotFetch(studentId) { this.snapshotFetched.add(studentId); }
  canAccessHistory(studentId) { return this.snapshotFetched.has(studentId); }
}

/**
 * Create a tool executor. Gatekeeper param kept for API compat but ignored —
 * prerequisite enforcement is handled by the registry.
 *
 * @param {Object} [_gatekeeper] - Deprecated, ignored.
 * @param {Object} [opts] - Options forwarded to registry executor.
 * @param {Map<string, boolean>} [opts.preloadedPrereqs] - Pre-seeded prerequisite
 *   fulfillments for students whose snapshots were pre-loaded into the prompt.
 */
export function createToolExecutor(_gatekeeper, opts = {}) {
  return createRegistryExecutor(digestTools, opts);
}

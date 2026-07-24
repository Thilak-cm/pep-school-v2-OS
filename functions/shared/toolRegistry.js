/**
 * Shared tool registry (PEP-304).
 *
 * Central catalog of all tools available to any agent CF.
 * Each tool declares its scope, prerequisites, OpenAI definition,
 * and executor. Agents select tools via their config's allowedTools
 * list, enforced by scope-level permissions (allowedToolScopes).
 *
 * Usage:
 *   import { getTools, createToolExecutor } from "../shared/toolRegistry.js";
 *   const tools = getTools(["fetch_weekly_snapshot", "fetch_soul"]);
 *   const executor = createToolExecutor(tools);
 *   const result = await runAgentLoop({ tools: tools.map(t => t.definition), toolExecutor: executor, ... });
 */

import { db } from "./firebase.js";

// ── Tool Catalog ──────────────────────────────────────────────────────

const TOOL_CATALOG = [
  {
    id: "fetch_weekly_snapshot",
    scope: "student",
    label: "Weekly Snapshot",
    description: "Full narrative summary for a student's current weekly snapshot",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_weekly_snapshot",
        description: "Fetch the full narrative summary for a student's weekly snapshot. Severity, flags, and coverage gaps are already in your input — use this tool when you need the detailed behavioral narrative to understand WHY a student has a particular severity or flag. Must be called before accessing snapshot history.",
        parameters: {
          type: "object",
          properties: { studentId: { type: "string", description: "The student document ID" } },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const snap = await db.doc(`students/${args.studentId}/ai_summaries/weekly_snapshot`).get();
      if (!snap.exists) return { error: "No weekly snapshot found" };
      const d = snap.data();
      return {
        studentId: args.studentId,
        summary: d.summary || null,
      };
    },
  },
  {
    id: "fetch_snapshot_history",
    scope: "student",
    label: "Snapshot History",
    description: "Previous weekly snapshots for trend analysis",
    prerequisites: ["fetch_weekly_snapshot"],
    definition: {
      type: "function",
      function: {
        name: "fetch_snapshot_history",
        description: "Fetch previous weekly snapshots for a student to analyze trends. REQUIRES fetch_weekly_snapshot to be called first for this student.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of historical weeks to fetch (default 4, max 12)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 4, 12);
      const snap = await db
        .collection(`students/${args.studentId}/ai_summaries/weekly_snapshot/history`)
        .orderBy("__name__", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((d) => ({ weekKey: d.id, ...d.data() }));
    },
  },
  {
    id: "fetch_soul",
    scope: "student",
    label: "Soul Narrative",
    description: "AI-generated holistic prose description of who the child is",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_soul",
        description: "Fetch the AI-generated soul narrative for a student — a holistic prose description of who the child is.",
        parameters: {
          type: "object",
          properties: { studentId: { type: "string", description: "The student document ID" } },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const snap = await db.doc(`students/${args.studentId}/ai_summaries/soul`).get();
      if (!snap.exists) return { error: "No soul document found" };
      return { studentId: args.studentId, content: snap.data().content };
    },
  },
  {
    id: "fetch_monthly_plan",
    scope: "student",
    label: "Monthly Plan",
    description: "Current monthly prescribed activities and goals",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_monthly_plan",
        description: "Fetch the current monthly plan for a student — prescribed activities and goals.",
        parameters: {
          type: "object",
          properties: { studentId: { type: "string", description: "The student document ID" } },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const snap = await db.doc(`students/${args.studentId}/ai_summaries/monthly_plan`).get();
      if (!snap.exists) return { error: "No monthly plan found" };
      const d = snap.data();
      return { studentId: args.studentId, month: d.month, content: d.content, generatedAt: d.generatedAt };
    },
  },
  {
    id: "fetch_writing_analysis",
    scope: "student",
    label: "Writing Analysis",
    description: "Latest handwriting assessment and progression",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_writing_analysis",
        description: "Fetch the latest writing analysis for a student — handwriting assessment and progression.",
        parameters: {
          type: "object",
          properties: { studentId: { type: "string", description: "The student document ID" } },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const snap = await db.doc(`students/${args.studentId}/ai_summaries/writing_analysis`).get();
      if (!snap.exists) return { error: "No writing analysis found" };
      return { studentId: args.studentId, ...snap.data() };
    },
  },
  {
    id: "fetch_interviews",
    scope: "student",
    label: "Interviews",
    description: "Recent interview transcripts",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_interviews",
        description: "Fetch recent interview transcripts for a student. Returns the most recent interviews.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of recent interviews to fetch (default 3)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 3, 10);
      const snap = await db.collection(`students/${args.studentId}/interviews`).orderBy("createdAt", "desc").limit(limit).get();
      if (snap.empty) return { error: "No interviews found" };
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, createdAt: data.createdAt, teacherName: data.teacherName,
          turns: (data.turns || []).map((t) => ({ role: t.role, content: typeof t.content === "string" ? t.content.slice(0, 500) : t.content })),
        };
      });
    },
  },
  {
    id: "fetch_observations",
    scope: "student",
    label: "Observations",
    description: "Recent observation texts (text, voice, lesson notes)",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_observations",
        description: "Fetch recent observations for a student. Returns the most recent observation texts.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of recent observations to fetch (default 10)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 10, 25);
      const snap = await db.collection(`students/${args.studentId}/observations`).orderBy("createdAt", "desc").limit(limit).get();
      if (snap.empty) return { error: "No observations found" };
      return snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, type: data.type, text: (data.text || "").slice(0, 500), createdBy: data.createdBy, createdAt: data.createdAt };
      });
    },
  },
  {
    id: "fetch_media",
    scope: "student",
    label: "Media",
    description: "Recent media uploads (photos, PDFs) with metadata",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_media",
        description: "Fetch recent media uploads (photos, PDFs) for a student. Returns metadata and descriptions.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of recent media items to fetch (default 5)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 5, 15);
      // #221: media docs migrated to observations subcollection
      const snap = await db.collection(`students/${args.studentId}/observations`).where("type", "==", "media").where("status", "==", "ready").orderBy("createdAt", "desc").limit(limit).get();
      if (snap.empty) return { error: "No media found" };
      return snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, type: data.type, title: data.title, description: data.description, createdAt: data.createdAt };
      });
    },
  },
];

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get the full catalog (for UI display / enumeration).
 */
export function getAllTools() {
  return TOOL_CATALOG.map(({ id, scope, label, description, prerequisites }) => ({
    id, scope, label, description, prerequisites,
  }));
}

/**
 * Filter catalog to specific tool IDs. Enforces scope permissions.
 *
 * @param {string[]} toolIds - Which tools to include
 * @param {string[]} [allowedScopes] - Allowed scopes (e.g. ["student"]). If null, all scopes allowed.
 * @returns {Object[]} Filtered tool entries with definition + execute
 */
export function getTools(toolIds, allowedScopes = null) {
  return TOOL_CATALOG.filter((t) => {
    if (!toolIds.includes(t.id)) return false;
    if (allowedScopes && !allowedScopes.includes(t.scope)) return false;
    return true;
  });
}

/**
 * Build the OpenAI tools array from selected tool entries.
 */
export function getToolDefinitions(tools) {
  return tools.map((t) => t.definition);
}

/**
 * Create an executor function for the given tools, with prerequisite enforcement.
 * Creates a fresh executor with its own prerequisite state — one per agent run.
 * Do NOT reuse across separate runs (e.g., different classrooms).
 *
 * @param {Object[]} tools - Tool entries from getTools()
 * @param {Object} [opts] - Options
 * @param {Map<string, boolean>} [opts.preloadedPrereqs] - Pre-seeded prerequisite
 *   fulfillments, keyed as "toolId:studentId". Use when data is pre-loaded into the
 *   prompt (e.g., weekly snapshots) so downstream tools aren't blocked.
 * @returns {Function} async (name, args) => result
 */
export function createToolExecutor(tools, opts = {}) {
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  // Track prerequisite state (e.g., snapshot fetched per student)
  const fulfilled = new Map(opts.preloadedPrereqs || []);

  return async (name, args) => {
    const tool = toolMap.get(name);
    if (!tool) return { error: `Unknown or disabled tool: ${name}` };

    // Check prerequisites
    for (const prereq of tool.prerequisites) {
      const key = `${prereq}:${args.studentId || ""}`;
      if (!fulfilled.get(key)) {
        return { error: `Must call ${prereq} for this student first before using ${name}.` };
      }
    }

    const result = await tool.execute(args);

    // Record fulfillment for downstream prerequisites
    const fulfillKey = `${name}:${args.studentId || ""}`;
    fulfilled.set(fulfillKey, true);

    return result;
  };
}

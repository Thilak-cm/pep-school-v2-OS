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
 *   const tools = getTools(["fetch_weekly_snapshots"]);
 *   const executor = createToolExecutor(tools);
 *   const result = await runAgentLoop({ tools: tools.map(t => t.definition), toolExecutor: executor, ... });
 */

import { db } from "./firebase.js";
import {isGenericObservation} from "./studentHelpers.js";

function messageTimeValue(message) {
  const value = message.createdAt || message.timestamp || 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value);
}

async function queryChatMessages(ref, field, limit) {
  const snap = await ref.orderBy(field, "desc").limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export function mergeChronologicalChatMessages(messageGroups, limit) {
  const byId = new Map();
  for (const message of messageGroups.flat()) byId.set(message.id, message);
  return [...byId.values()]
    .sort((a, b) => {
      const left = messageTimeValue(a);
      const right = messageTimeValue(b);
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .slice(-limit);
}

export async function collectEligibleObservationDocs(fetchPage, limit) {
  const eligible = [];
  let cursor = null;
  while (eligible.length < limit) {
    const docs = await fetchPage(cursor);
    if (!docs.length) break;
    for (const doc of docs) {
      if (isGenericObservation(doc.data())) eligible.push(doc);
      if (eligible.length === limit) break;
    }
    cursor = docs[docs.length - 1];
  }
  return eligible;
}

// ── Tool Catalog ──────────────────────────────────────────────────────

const TOOL_CATALOG = [
  {
    id: "fetch_weekly_snapshots",
    scope: "student",
    label: "Weekly Snapshot",
    description: "Full narrative summary for a student's current weekly snapshot",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_weekly_snapshots",
        description: "Fetch the full narrative summary for a student's weekly snapshot. Severity, flags, and coverage gaps are already in your input — use this tool when you need the detailed behavioral narrative to understand WHY a student has a particular severity or flag. Must be called before accessing snapshot history.",
        parameters: {
          type: "object",
          properties: {
            week: { type: "string", description: "Exact YYYY-Www week, optional" },
            sinceWeek: { type: "string", description: "Return snapshots since this YYYY-Www week, optional" },
            limit: { type: "number", description: "Number of snapshots, optional" },
          },
          required: [],
        },
      },
    },
    execute: async (args) => {
      const snap = await db.doc(`students/${args.studentId}/ai_summaries/weekly_snapshot`).get();
      if (!snap.exists) return { error: "No weekly snapshot found" };
      const d = snap.data();
      return {
        summary: d.summary || null,
      };
    },
  },
  {
    id: "fetch_monthly_plans",
    scope: "student",
    label: "Monthly Plan",
    description: "Current monthly prescribed activities and goals",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_monthly_plans",
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
    id: "fetch_writing_analyses",
    scope: "student",
    label: "Writing Analysis",
    description: "Latest handwriting assessment and progression",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_writing_analyses",
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
          observedOn: data.conductedAt || data.createdAt || null, teacherName: data.teacherName,
          turns: (data.turns || []).map((t) => ({ role: t.role, content: t.content })),
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
      const pageSize = Math.max(25, limit * 2);
      const observationsRef = db.collection(
        `students/${args.studentId}/observations`,
      );
      const docs = await collectEligibleObservationDocs(async (cursor) => {
        let query = observationsRef
          .orderBy("createdAt", "desc")
          .limit(pageSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        return snapshot.docs;
      }, limit);
      const observations = docs.map((d) => {
        const data = d.data();
        return { type: data.type, text: data.text || data.description || "", observedAt: data.observedAt || data.createdAt || null };
      });
      return observations.length ? observations : {error: "No observations found"};
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
        return { type: data.type, title: data.title, description: data.description, observedAt: data.observedAt || data.createdAt || null };
      });
    },
  },
  {
    id: "fetch_term_reports",
    scope: "student",
    label: "Term Reports",
    description: "Generated parent-facing term progress reports",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_term_reports",
        description: "Fetch generated parent-facing term progress reports for the student. Use when the teacher asks about report language, older formal progress summaries, or how the child's progress has been communicated to parents.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of reports to fetch (default 3, max 10)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 3, 10);
      const snap = await db.collection(`students/${args.studentId}/ai_summaries`).get();
      const reports = [];
      snap.forEach((doc) => {
        const id = doc.id;
        if (!id.startsWith("report_") || id.endsWith("_readiness")) return;
        const data = doc.data() || {};
        const reportType = data.reportType === "monthly" ? "baseline" : (data.reportType || "term");
        if (reportType !== "term") return;
        reports.push({
          reportType,
          generatedAt: data.generatedAt,
          dateRangeStart: data.dateRangeStart,
          dateRangeEnd: data.dateRangeEnd,
          noteCount: data.noteCount ?? null,
          status: data.status || null,
          reportText: data.reportText || "",
        });
      });
      reports.sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
      return reports.slice(0, limit);
    },
  },
  {
    id: "fetch_baseline_reports",
    scope: "student",
    label: "Baseline Reports",
    description: "Generated parent-facing baseline reports",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_baseline_reports",
        description: "Fetch generated parent-facing baseline reports for the student. Use when the teacher asks about baseline assessment, starting-point narratives, or initial development summaries.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of reports to fetch (default 3, max 10)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 3, 10);
      const snap = await db.collection(`students/${args.studentId}/ai_summaries`).get();
      const reports = [];
      snap.forEach((doc) => {
        const id = doc.id;
        if (!id.startsWith("baseline_report_") || id.endsWith("_readiness")) return;
        const data = doc.data() || {};
        reports.push({
          reportType: data.reportType === "monthly" ? "baseline" : (data.reportType || "baseline"),
          generatedAt: data.generatedAt,
          dateRangeStart: data.dateRangeStart,
          dateRangeEnd: data.dateRangeEnd,
          noteCount: data.noteCount ?? null,
          status: data.status || null,
          reportEval: data.reportEval || null,
          reportText: data.reportText || "",
        });
      });
      reports.sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
      return reports.slice(0, limit);
    },
  },
  {
    id: "fetch_placements",
    scope: "student",
    label: "Placement History",
    description: "Classroom placement history for the student",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_placements",
        description: "Fetch classroom placement history for the student. Use when classroom transitions, current classroom, or historical enrollment context matters.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            limit: { type: "number", description: "Number of placements to fetch (default 10, max 25)" },
          },
          required: ["studentId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 10, 25);
      const snap = await db
        .collection(`students/${args.studentId}/placements`)
        .orderBy("startDate", "desc")
        .limit(limit)
        .get();
      if (snap.empty) return { error: "No placement history found" };
      return snap.docs.map((d) => ({ classroomName: d.data().classroomName, startDate: d.data().startDate, endDate: d.data().endDate, notes: d.data().notes }));
    },
  },
  {
    id: "fetch_chat_history",
    scope: "student",
    label: "Chat History",
    description: "Older messages from the current chat thread",
    prerequisites: [],
    definition: {
      type: "function",
      function: {
        name: "fetch_chat_history",
        description: "Fetch older messages from this same chat thread. Use when the teacher refers to earlier parts of the conversation that are not visible in your immediate context.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "The student document ID" },
            chatId: { type: "string", description: "The chat document ID" },
            limit: { type: "number", description: "Number of recent messages to fetch (default 20, max 80)" },
          },
          required: ["studentId", "chatId"],
        },
      },
    },
    execute: async (args) => {
      const limit = Math.min(args.limit || 20, 80);
      const messagesRef = db.collection(
        `students/${args.studentId}/chats/${args.chatId}/messages`,
      );
      const messages = mergeChronologicalChatMessages(await Promise.all([
        queryChatMessages(messagesRef, "createdAt", limit),
        queryChatMessages(messagesRef, "timestamp", limit),
      ]), limit);
      if (!messages.length) return { error: "No chat history found" };
      return messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt || message.timestamp || null,
      }));
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

function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(definition));
}

function omitBoundParameters(definition, boundArgs = {}) {
  const cloned = cloneDefinition(definition);
  const params = cloned.function?.parameters;
  if (!params?.properties) return cloned;

  for (const key of Object.keys(boundArgs)) {
    delete params.properties[key];
  }
  if (Array.isArray(params.required)) {
    params.required = params.required.filter((key) => !(key in boundArgs));
  }
  return cloned;
}

/**
 * Build the OpenAI tools array from selected tool entries.
 *
 * @param {Object[]} tools - Tool entries from getTools()
 * @param {Object} [opts] - Options
 * @param {Object} [opts.boundArgs] - Args injected server-side and hidden from
 *   the model schema. Chat uses this to keep studentId/chatId authoritative.
 */
export function getToolDefinitions(tools, opts = {}) {
  return tools.map((t) => omitBoundParameters(t.definition, opts.boundArgs));
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
 * @param {Object} [opts.boundArgs] - Args injected after model generation, before
 *   prerequisite checks and execution. Bound args override model-supplied values.
 * @returns {Function} async (name, args) => result
 */
export function createToolExecutor(tools, opts = {}) {
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  // Track prerequisite state (e.g., snapshot fetched per student)
  const fulfilled = new Map(opts.preloadedPrereqs || []);
  const boundArgs = opts.boundArgs || {};

  return async (name, args) => {
    const tool = toolMap.get(name);
    if (!tool) return { error: `Unknown or disabled tool: ${name}` };
    const effectiveArgs = { ...(args || {}), ...boundArgs };

    // Check prerequisites
    for (const prereq of tool.prerequisites) {
      const key = `${prereq}:${effectiveArgs.studentId || ""}`;
      if (!fulfilled.get(key)) {
        return { error: `Must call ${prereq} for this student first before using ${name}.` };
      }
    }

    const result = await tool.execute(effectiveArgs);

    // Record fulfillment for downstream prerequisites
    const fulfillKey = `${name}:${effectiveArgs.studentId || ""}`;
    fulfilled.set(fulfillKey, true);

    return result;
  };
}

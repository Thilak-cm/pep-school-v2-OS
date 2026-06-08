/**
 * Digest agent tool definitions (PEP-297).
 *
 * 8 tools for the per-classroom digest agent to investigate student data.
 * Includes progressive disclosure: fetch_snapshot_history is gated behind
 * fetch_weekly_snapshot for the same student.
 */

import { db } from "../shared/firebase.js";

// ── Tool Definitions (OpenAI format) ────────────────────────────────

export const DIGEST_TOOLS = [
  {
    type: "function",
    function: {
      name: "fetch_weekly_snapshot",
      description:
        "Fetch the current weekly snapshot for a student. Contains behavioral flags, severity, escalation status, red flags, and coverage gaps. Call this first before accessing snapshot history.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_snapshot_history",
      description:
        "Fetch previous weekly snapshots for a student to analyze trends. REQUIRES fetch_weekly_snapshot to be called first for this student.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
          limit: {
            type: "number",
            description:
              "Number of historical weeks to fetch (default 4, max 12)",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_soul",
      description:
        "Fetch the AI-generated soul narrative for a student — a holistic prose description of who the child is.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_monthly_plan",
      description:
        "Fetch the current monthly plan for a student — prescribed activities and goals.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_writing_analysis",
      description:
        "Fetch the latest writing analysis for a student — handwriting assessment and progression.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_interviews",
      description:
        "Fetch recent interview transcripts for a student. Returns the most recent interviews.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
          limit: {
            type: "number",
            description: "Number of recent interviews to fetch (default 3)",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_observations",
      description:
        "Fetch recent observations for a student. Returns the most recent observation texts.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
          limit: {
            type: "number",
            description:
              "Number of recent observations to fetch (default 10)",
          },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_media",
      description:
        "Fetch recent media uploads (photos, PDFs) for a student. Returns metadata and descriptions.",
      parameters: {
        type: "object",
        properties: {
          studentId: {
            type: "string",
            description: "The student document ID",
          },
          limit: {
            type: "number",
            description: "Number of recent media items to fetch (default 5)",
          },
        },
        required: ["studentId"],
      },
    },
  },
];

// ── Progressive Disclosure Gatekeeper ───────────────────────────────

export class ToolGatekeeper {
  constructor() {
    this.snapshotFetched = new Set();
  }

  recordSnapshotFetch(studentId) {
    this.snapshotFetched.add(studentId);
  }

  canAccessHistory(studentId) {
    return this.snapshotFetched.has(studentId);
  }
}

// ── Tool Executor ───────────────────────────────────────────────────

/**
 * Create a tool executor bound to a gatekeeper instance.
 *
 * @param {ToolGatekeeper} gatekeeper
 * @returns {Function} async (name, args) => result
 */
export function createToolExecutor(gatekeeper) {
  return async (name, args) => {
    const { studentId } = args;

    switch (name) {
      case "fetch_weekly_snapshot": {
        const snap = await db
          .doc(`students/${studentId}/ai_summaries/weekly_snapshot`)
          .get();
        if (!snap.exists) return { error: "No weekly snapshot found" };
        gatekeeper.recordSnapshotFetch(studentId);
        const d = snap.data();
        return {
          studentId,
          severity: d.severity,
          severityScore: d.severityScore,
          escalatedThisWeek: d.escalatedThisWeek,
          improvedThisWeek: d.improvedThisWeek,
          redFlag: d.redFlag || null,
          coverageGaps: d.coverageGaps || [],
          status: d.status,
          studentName: d.studentName,
        };
      }

      case "fetch_snapshot_history": {
        if (!gatekeeper.canAccessHistory(studentId)) {
          return {
            error:
              "Must call fetch_weekly_snapshot for this student first before accessing history.",
          };
        }
        const limit = Math.min(args.limit || 4, 12);
        const snap = await db
          .collection(
            `students/${studentId}/ai_summaries/weekly_snapshot/history`
          )
          .orderBy("__name__", "desc")
          .limit(limit)
          .get();
        return snap.docs.map((d) => ({
          weekKey: d.id,
          ...d.data(),
        }));
      }

      case "fetch_soul": {
        const snap = await db
          .doc(`students/${studentId}/ai_summaries/soul`)
          .get();
        if (!snap.exists) return { error: "No soul document found" };
        return { studentId, content: snap.data().content };
      }

      case "fetch_monthly_plan": {
        const snap = await db
          .doc(`students/${studentId}/ai_summaries/monthly_plan`)
          .get();
        if (!snap.exists) return { error: "No monthly plan found" };
        const d = snap.data();
        return {
          studentId,
          month: d.month,
          content: d.content,
          generatedAt: d.generatedAt,
        };
      }

      case "fetch_writing_analysis": {
        const snap = await db
          .doc(`students/${studentId}/ai_summaries/writing_analysis`)
          .get();
        if (!snap.exists) return { error: "No writing analysis found" };
        return { studentId, ...snap.data() };
      }

      case "fetch_interviews": {
        const limit = Math.min(args.limit || 3, 10);
        const snap = await db
          .collection(`students/${studentId}/interviews`)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        if (snap.empty) return { error: "No interviews found" };
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            createdAt: data.createdAt,
            teacherName: data.teacherName,
            turns: (data.turns || []).map((t) => ({
              role: t.role,
              content:
                typeof t.content === "string"
                  ? t.content.slice(0, 500)
                  : t.content,
            })),
          };
        });
      }

      case "fetch_observations": {
        const limit = Math.min(args.limit || 10, 25);
        const snap = await db
          .collection(`students/${studentId}/observations`)
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        if (snap.empty) return { error: "No observations found" };
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type,
            text: (data.text || "").slice(0, 500),
            createdBy: data.createdBy,
            createdAt: data.createdAt,
          };
        });
      }

      case "fetch_media": {
        const limit = Math.min(args.limit || 5, 15);
        const snap = await db
          .collection(`students/${studentId}/media`)
          .where("status", "==", "ready")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();
        if (snap.empty) return { error: "No media found" };
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type,
            title: data.title,
            description: data.description,
            createdAt: data.createdAt,
          };
        });
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}

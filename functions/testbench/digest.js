/**
 * Test bench handler for digest generation (PEP-304).
 *
 * Runs the full agent loop with configurable tools against a single
 * classroom (classroom mode) or stored classroom digests (superadmin mode).
 * Does NOT send emails or write to production digest docs.
 */

import { db } from "../shared/firebase.js";
import { runAgentLoop } from "../shared/agentLoop.js";
import {
  getTools,
  getToolDefinitions,
  createToolExecutor,
} from "../shared/toolRegistry.js";
import { buildFirstUserMessage } from "../digest/index.js";

// Default tool set for digest agent
const DEFAULT_DIGEST_TOOLS = [
  "fetch_weekly_snapshot",
  "fetch_snapshot_history",
  "fetch_soul",
  "fetch_monthly_plan",
  "fetch_writing_analysis",
  "fetch_interviews",
  "fetch_observations",
  "fetch_media",
];

/**
 * Fetch config/weekly_digest for default prompts + model settings.
 */
async function fetchDigestConfig() {
  const snap = await db.collection("config").doc("weekly_digest").get();
  if (!snap.exists) {
    return {
      model: "openai/gpt-4.1-mini",
      temperature: 0.4,
      maxTokens: 4000,
      classroomPrompt: "",
      superadminPrompt: "",
      contextualNotes: "",
      allowedTools: DEFAULT_DIGEST_TOOLS,
      allowedToolScopes: ["student"],
    };
  }
  const d = snap.data();
  return {
    model: d.model || "openai/gpt-4.1-mini",
    temperature: d.temperature ?? 0.4,
    maxTokens: d.max_tokens || 4000,
    classroomPrompt: d.classroomPrompt || "",
    superadminPrompt: d.superadminPrompt || "",
    contextualNotes: d.contextualNotes || "",
    allowedTools: d.allowedTools || DEFAULT_DIGEST_TOOLS,
    allowedToolScopes: d.allowedToolScopes || ["student"],
  };
}

/**
 * Build superadmin user message from stored classroom digests.
 */
function buildSuperadminUserMessage(digests, contextualNotes) {
  const digestSummaries = digests
    .map(
      (d) =>
        `## ${d.classroomName}${d.hasRedFlags ? " ⚠️ RED FLAGS" : ""}\n\n${d.htmlContent}`
    )
    .join("\n\n---\n\n");

  const notesSection = contextualNotes
    ? ["## School Contextual Notes", contextualNotes, ""]
    : [];

  return [
    "# All Classroom Digests",
    `Total classrooms: ${digests.length}`,
    `Classrooms with red flags: ${digests.filter((d) => d.hasRedFlags).length}`,
    "",
    ...notesSection,
    digestSummaries,
    "",
    "Generate a consolidated executive summary email for superadmins. Highlight the most critical items across all classrooms. Identify cross-classroom patterns. Use tools to investigate specific cases if needed.",
  ].join("\n");
}

/**
 * Resolve which tools to use for this run.
 * enabledTools (from UI) is intersected with config.allowedTools (permissions).
 */
function resolveTools(enabledTools, config) {
  // If UI sent a specific list, intersect with what the agent is allowed
  const requestedIds = Array.isArray(enabledTools) && enabledTools.length > 0
    ? enabledTools.filter((id) => config.allowedTools.includes(id))
    : config.allowedTools;

  return getTools(requestedIds, config.allowedToolScopes);
}

export async function testBenchDigest({
  classroomId,
  promptType,
  systemPrompt,
  model,
  temperature,
  maxTokens,
  enabledTools,
}) {
  const config = await fetchDigestConfig();
  const tools = resolveTools(enabledTools, config);
  const toolDefs = getToolDefinitions(tools);
  const toolExecutor = createToolExecutor(tools);

  if (promptType === "superadmin") {
    const classroomsSnap = await db
      .collection("classrooms")
      .where("status", "==", "active")
      .get();

    const digests = [];
    for (const cDoc of classroomsSnap.docs) {
      const digestSnap = await db
        .doc(`classrooms/${cDoc.id}/digests/weekly_email`)
        .get();
      if (digestSnap.exists) {
        digests.push({
          classroomId: cDoc.id,
          classroomName: cDoc.data().name || cDoc.id,
          ...digestSnap.data(),
        });
      }
    }

    if (digests.length === 0) {
      return {
        output: "<p>No classroom digests found. Run classroom digest generation first.</p>",
        totalTokens: 0,
        toolCallLog: [],
        iterations: 0,
      };
    }

    const userMessage = buildSuperadminUserMessage(digests, config.contextualNotes);

    const result = await runAgentLoop({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: toolDefs,
      toolExecutor,
      model: { model, temperature, maxTokens },
    });

    return {
      output: result.content,
      totalTokens: result.totalTokens || 0,
      toolCallLog: result.toolCallLog,
      iterations: result.iterations,
    };
  }

  // ── Classroom mode ──────────────────────────────────────────────────
  if (!classroomId) {
    throw new Error("classroomId is required for classroom prompt type");
  }

  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  if (!classroomSnap.exists) {
    throw new Error(`Classroom ${classroomId} not found`);
  }

  const classroomDoc = { id: classroomSnap.id, ...classroomSnap.data() };
  const statsSnap = await db.collection("statsCache").doc(`classroom_${classroomId}`).get();
  const statsDoc = statsSnap.exists ? statsSnap.data() : null;

  const userMessage = buildFirstUserMessage(classroomDoc, statsDoc, config.contextualNotes);

  const result = await runAgentLoop({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    tools: toolDefs,
    toolExecutor,
    model: { model, temperature, maxTokens },
  });

  return {
    output: result.content,
    totalTokens: result.totalTokens || 0,
    toolCallLog: result.toolCallLog,
    iterations: result.iterations,
  };
}

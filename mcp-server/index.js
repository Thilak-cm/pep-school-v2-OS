#!/usr/bin/env node

/**
 * Pep OS Firestore MCP Server
 *
 * Provides read-only Firestore tools for Claude to query the full Pep OS schema:
 * students, observations, AI summaries, media, placements, interviews, chats,
 * classrooms, branches, programs, users, feedback, testbench, and config.
 *
 * Transport: stdio (standard MCP transport)
 * Auth: firebase-admin with service account key or ADC fallback
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import admin from "firebase-admin";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  TOOL_DEFINITIONS,
  handleGetStudent,
  handleListStudents,
  handleGetObservations,
  handleQueryObservations,
  handleGetBaseballCard,
  handleGetAiSummary,
  handleGetAiSummaryHistory,
  handleListMedia,
  handleGetMediaStats,
  handleListPlacements,
  handleListInterviews,
  handleListChats,
  handleGetChatMessages,
  handleListClassrooms,
  handleListBranches,
  handleGetBranch,
  handleListPrograms,
  handleGetUser,
  handleListUsers,
  handleListFeedback,
  handleListTestbenchRuns,
  handleGetConfig,
  handleListConfig,
} from "./tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = resolve(__dirname, "../firebase-service-account.json");
const PROJECT_ID = "pep-os";

// --- Firebase Init ---

function initFirebase() {
  if (existsSync(SERVICE_ACCOUNT_PATH)) {
    const sa = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: PROJECT_ID,
    });
    process.stderr.write("firestore-mcp: auth via service account\n");
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
    process.stderr.write("firestore-mcp: auth via ADC\n");
  }
  return admin.firestore();
}

const db = initFirebase();

// --- MCP Server ---

const server = new Server(
  { name: "pep-os-firestore", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

// Map tool names to handlers
const HANDLERS = {
  get_student: (p) => handleGetStudent(db, p),
  list_students: (p) => handleListStudents(db, p),
  get_observations: (p) => handleGetObservations(db, p),
  query_observations: (p) => handleQueryObservations(db, p),
  get_baseball_card: (p) => handleGetBaseballCard(db, p),
  get_ai_summary: (p) => handleGetAiSummary(db, p),
  get_ai_summary_history: (p) => handleGetAiSummaryHistory(db, p),
  list_media: (p) => handleListMedia(db, p),
  get_media_stats: (p) => handleGetMediaStats(db, p),
  list_placements: (p) => handleListPlacements(db, p),
  list_interviews: (p) => handleListInterviews(db, p),
  list_chats: (p) => handleListChats(db, p),
  get_chat_messages: (p) => handleGetChatMessages(db, p),
  list_classrooms: (p) => handleListClassrooms(db, p),
  list_branches: () => handleListBranches(db),
  get_branch: (p) => handleGetBranch(db, p),
  list_programs: () => handleListPrograms(db),
  get_user: (p) => handleGetUser(db, p),
  list_users: (p) => handleListUsers(db, p),
  list_feedback: (p) => handleListFeedback(db, p),
  list_testbench_runs: (p) => handleListTestbenchRuns(db, p),
  get_config: (p) => handleGetConfig(db, p),
  list_config: () => handleListConfig(db),
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  const handler = HANDLERS[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await handler(params || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    process.stderr.write(`firestore-mcp: error in ${name}: ${err.message}\n`);
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("firestore-mcp: connected via stdio\n");

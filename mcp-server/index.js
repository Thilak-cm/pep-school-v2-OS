#!/usr/bin/env node

/**
 * Pep OS Firestore MCP Server
 *
 * Provides read-only Firestore tools for Claude to query student data,
 * observations, baseball cards, and classrooms. Designed for the Coach Pepper
 * Telegram bot via Claude Code Channels.
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
  handleGetObservations,
  handleGetBaseballCard,
  handleListStudents,
  handleListClassrooms,
  handleGetAiPrompt,
  handleListAiPrompts,
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
  { name: "pep-os-firestore", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  try {
    let result;

    switch (name) {
      case "get_student":
        result = await handleGetStudent(db, params);
        break;
      case "get_observations":
        result = await handleGetObservations(db, params);
        break;
      case "get_baseball_card":
        result = await handleGetBaseballCard(db, params);
        break;
      case "list_students":
        result = await handleListStudents(db, params);
        break;
      case "list_classrooms":
        result = await handleListClassrooms(db);
        break;
      case "get_ai_prompt":
        result = await handleGetAiPrompt(db, params);
        break;
      case "list_ai_prompts":
        result = await handleListAiPrompts(db);
        break;
      case "get_config":
        result = await handleGetConfig(db, params);
        break;
      case "list_config":
        result = await handleListConfig(db);
        break;
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

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

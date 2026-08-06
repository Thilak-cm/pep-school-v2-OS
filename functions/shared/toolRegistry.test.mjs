import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

import {
  createToolExecutor,
  getToolDefinitions,
  getTools,
  mergeChronologicalChatMessages,
} from "./toolRegistry.js";

test("getToolDefinitions strips server-bound arguments from model schemas", () => {
  const tools = getTools(["fetch_observations"], ["student"]);
  const definitions = getToolDefinitions(tools, {
    boundArgs: { studentId: "student-bound" },
  });

  const params = definitions[0].function.parameters;
  assert.equal(params.properties.studentId, undefined);
  assert.deepEqual(params.required, []);
});

test("createToolExecutor overrides hallucinated bound arguments before execution", async () => {
  const tools = [{
    id: "fetch_observations",
    prerequisites: [],
    execute: async (args) => args,
  }];
  const executor = createToolExecutor(tools, {
    boundArgs: { studentId: "student-bound", chatId: "chat-bound" },
  });

  const result = await executor("fetch_observations", {
    studentId: "student-hallucinated",
    chatId: "chat-hallucinated",
    limit: 3,
  });

  assert.equal(result.studentId, "student-bound");
  assert.equal(result.chatId, "chat-bound");
  assert.equal(result.limit, 3);
});

test("createToolExecutor checks prerequisites with the server-bound student", async () => {
  const tools = [{
    id: "fetch_snapshot_history",
    prerequisites: ["fetch_weekly_snapshot"],
    execute: async (args) => ({ studentId: args.studentId }),
  }];
  const executor = createToolExecutor(tools, {
    boundArgs: { studentId: "student-bound" },
    preloadedPrereqs: new Map([["fetch_weekly_snapshot:student-bound", true]]),
  });

  const result = await executor("fetch_snapshot_history", {
    studentId: "student-hallucinated",
  });

  assert.deepEqual(result, { studentId: "student-bound" });
});

test("chat history merge preserves timestamp-only legacy messages", () => {
  const messages = mergeChronologicalChatMessages([
    [{ id: "new", createdAt: 2, content: "new" }],
    [{ id: "legacy", timestamp: 1, content: "legacy" }],
  ], 20);

  assert.deepEqual(messages.map((message) => message.id), ["legacy", "new"]);
});

test("fetch_media query has its required observations composite index", async () => {
  const raw = await readFile(new URL("../../firestore.indexes.json", import.meta.url), "utf8");
  const config = JSON.parse(raw);
  const expectedFields = [
    { fieldPath: "type", order: "ASCENDING" },
    { fieldPath: "status", order: "ASCENDING" },
    { fieldPath: "createdAt", order: "DESCENDING" },
  ];
  const match = config.indexes.some((index) => index.collectionGroup === "observations"
    && index.queryScope === "COLLECTION"
    && JSON.stringify(index.fields) === JSON.stringify(expectedFields));

  assert.equal(match, true);
});

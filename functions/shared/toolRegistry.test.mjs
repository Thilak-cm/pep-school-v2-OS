import test from "node:test";
import assert from "node:assert/strict";

import { createToolExecutor, getToolDefinitions, getTools } from "./toolRegistry.js";

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

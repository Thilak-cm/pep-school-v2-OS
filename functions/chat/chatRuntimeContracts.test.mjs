import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const sourceUrl = new URL("./index.js", import.meta.url);

test("durable acquisition precedes provider and config resolution", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const acquisition = source.indexOf("await acquireChatTurn({");
  const config = source.indexOf("await loadChatConfig(");
  const provider = source.indexOf("getOpenRouterKey()");

  assert.ok(acquisition > 0);
  assert.ok(config > acquisition);
  assert.ok(provider > acquisition);
});

test("chat runtime requires Langfuse and isolates trace shutdown failures", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /chat\/observability-not-configured/);
  assert.match(source, /failed to close Langfuse trace/);
  assert.match(source, /Langfuse flush failed/);
  assert.match(source, /output: \{ status: terminalStatus/);
});

test("chat runtime exposes only server-bound student tools", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /getTools\(chatConfig\.allowedTools, \["student"\]\)/);
  assert.match(source, /boundArgs = \{ studentId: request\.studentId, chatId: request\.chatId \}/);
});

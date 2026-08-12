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

test("chat runtime emits one latency summary and threads telemetry through context and provider", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /new ChatLatencyRecorder/);
  assert.match(source, /requestBytes: jsonUtf8ByteLength\(req\.body \|\| \{\}\)/);
  assert.match(source, /buildChatMessages\(\{[\s\S]*telemetry/);
  assert.match(source, /runStreamingAgentLoop\(\{[\s\S]*telemetry/);
  assert.match(source, /telemetry\.emit\(functions\.logger\)/);
  assert.match(source, /timing: telemetry\.snapshot\(\)/);
});

test("chat runtime correlates opaque IDs before auth and classifies early failures", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const correlation = source.indexOf("correlation = parseChatCorrelation(");
  const authentication = source.indexOf("await verifyRequest(req, telemetry)");

  assert.ok(correlation > 0);
  assert.ok(authentication > correlation);
  assert.match(source, /\(runCorrelation\) => telemetry\.setCorrelation\(runCorrelation\)/);
  assert.match(source, /auth\/unauthenticated/);
  assert.match(source, /auth\/user-profile-missing/);
  assert.match(source, /chat\/student-not-found/);
  assert.match(source, /auth\/permission-denied/);
});

test("chat runtime records observation serialization, disconnect handling, and request completion", async () => {
  const [runtimeSource, contextSource, repositorySource, providerSource] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(new URL("./chatContext.js", import.meta.url), "utf8"),
    readFile(new URL("./chatRepository.js", import.meta.url), "utf8"),
    readFile(new URL("./openrouterStream.js", import.meta.url), "utf8"),
  ]);

  assert.match(contextSource, /startStage\?\.\("observation_serialization"\)/);
  assert.match(runtimeSource, /startStage\("correlation_parsing"\)/);
  assert.match(runtimeSource, /startStage\?\.\("access_decision"\)/);
  assert.match(repositorySource, /measuredRead\(telemetry, "chat_document_load"/);
  assert.match(runtimeSource, /startStage\("assistant_message_persistence"\)/);
  assert.match(providerSource, /startStage\?\.\("usage_recording"/);
  assert.match(runtimeSource, /startStage\("disconnect_abort_handling"\)/);
  assert.match(runtimeSource, /telemetry\.mark\("request_complete"\)/);
});

test("chat runtime classifies replay, active, superseded, and method exits before snapshots", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /turn\.status === "completed"[\s\S]*setOutcome\("completed"\)/);
  assert.match(source, /setOutcome\("interrupted", turn\.errorCode \|\| "chat\/replay-interrupted"\)/);
  assert.match(source, /disposition === "active"[\s\S]*setOutcome\("failed", "chat\/turn-active"\)/);
  assert.match(source, /!started\.started[\s\S]*setOutcome\("interrupted", "chat\/turn-superseded"\)/);
  assert.match(source, /setOutcome\("failed", "chat\/method-not-allowed"\)/);
});

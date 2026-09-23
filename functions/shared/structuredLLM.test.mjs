import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  runStructuredLLM,
  buildJsonSchemaResponseFormat,
  formatZodError,
} from "./structuredLLM.js";

// Mirrors BaseballCardResponseSchema (functions/ai/baseballCard.js) - the
// first production adopter and the shape from the W38 incident.
const cardSchema = z.object({
  summary: z.string().min(1),
  redFlag: z.object({
    severity: z.enum(["low", "medium", "high"]).nullable(),
    reason: z.string().nullable(),
  }),
  coverageGaps: z.array(z.string()),
});

const VALID_OUTPUT = JSON.stringify({
  summary: "Para one.\n\nPara two.",
  redFlag: { severity: null, reason: null },
  coverageGaps: [],
});

/** Build an injectable runLLM stub that replays scripted responses. */
function stubRunLLM(responses) {
  const calls = [];
  return {
    calls,
    runLLM: async (options) => {
      calls.push(options);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      return {
        content: next.content,
        finishReason: next.finishReason ?? "stop",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        resolvedModel: "openai/test-model",
        responseModel: null,
      };
    },
  };
}

function baseOptions(stub) {
  return {
    schema: cardSchema,
    schemaName: "baseball_card_summary",
    featureId: "baseball_card",
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "notes" },
    ],
    model: "test-model",
    deps: { runLLM: stub.runLLM },
  };
}

test("valid first attempt returns parsed data with zero repairs", async () => {
  const stub = stubRunLLM([{ content: VALID_OUTPUT }]);
  const result = await runStructuredLLM(baseOptions(stub));

  assert.equal(stub.calls.length, 1);
  assert.equal(result.repairAttempts, 0);
  assert.equal(result.data.summary, "Para one.\n\nPara two.");
  assert.equal(result.data.redFlag.severity, null);
  assert.deepEqual(result.data.coverageGaps, []);
  assert.equal(result.rawContent, VALID_OUTPUT);
});

test("request carries strict json_schema response_format on every attempt", async () => {
  const stub = stubRunLLM([
    { content: "not json" },
    { content: VALID_OUTPUT },
  ]);
  await runStructuredLLM(baseOptions(stub));

  for (const call of stub.calls) {
    assert.equal(call.responseFormat.type, "json_schema");
    assert.equal(call.responseFormat.json_schema.strict, true);
    assert.equal(call.responseFormat.json_schema.name, "baseball_card_summary");
    assert.equal(call.responseFormat.json_schema.schema.additionalProperties, false);
    assert.deepEqual(
      call.responseFormat.json_schema.schema.required,
      ["summary", "redFlag", "coverageGaps"],
    );
  }
});

test("malformed JSON triggers repair with bad output and error in context", async () => {
  // W38 Roohi mode: unterminated JSON.
  const truncated = "{\"summary\":\"Across the last 42 days";
  const stub = stubRunLLM([
    { content: truncated },
    { content: VALID_OUTPUT },
  ]);
  const result = await runStructuredLLM(baseOptions(stub));

  assert.equal(stub.calls.length, 2);
  assert.equal(result.repairAttempts, 1);

  const repairMessages = stub.calls[1].messages;
  assert.equal(repairMessages.length, 4); // system, user, assistant(bad), user(repair)
  assert.equal(repairMessages[2].role, "assistant");
  assert.equal(repairMessages[2].content, truncated);
  assert.equal(repairMessages[3].role, "user");
  assert.match(repairMessages[3].content, /failed validation/);
  assert.match(repairMessages[3].content, /invalid JSON/);
});

test("schema violation triggers repair with field path in error", async () => {
  const badShape = JSON.stringify({
    summary: "ok",
    redFlag: { severity: "moderate", reason: null },
    coverageGaps: [],
  });
  const stub = stubRunLLM([
    { content: badShape },
    { content: VALID_OUTPUT },
  ]);
  const result = await runStructuredLLM(baseOptions(stub));

  assert.equal(result.repairAttempts, 1);
  assert.match(stub.calls[1].messages[3].content, /redFlag\.severity/);
});

test("finish_reason length is treated as failure even if content parses", async () => {
  // Cap-hit = degenerate generation; never accepted, never a cue to raise the cap.
  const stub = stubRunLLM([
    { content: VALID_OUTPUT, finishReason: "length" },
    { content: VALID_OUTPUT, finishReason: "stop" },
  ]);
  const result = await runStructuredLLM(baseOptions(stub));

  assert.equal(stub.calls.length, 2);
  assert.equal(result.repairAttempts, 1);
  assert.match(stub.calls[1].messages[3].content, /truncated at max_tokens/);
});

test("fails with schema_violation internal error after 2 repair attempts (3 calls)", async () => {
  const stub = stubRunLLM([{ content: "never json" }]);

  await assert.rejects(
    () => runStructuredLLM(baseOptions(stub)),
    (err) => {
      assert.equal(err.code, "internal"); // PERMANENT_CODES: ACK + failed work item
      assert.match(err.message, /schema_violation/);
      assert.match(err.message, /2 repair attempt/);
      return true;
    },
  );
  assert.equal(stub.calls.length, 3);
});

test("repair context always rebuilds from original messages, not compounding", async () => {
  const stub = stubRunLLM([{ content: "bad one" }, { content: "bad two" }, { content: "bad three" }]);

  await assert.rejects(() => runStructuredLLM(baseOptions(stub)));
  // Third call: original 2 messages + 1 bad output + 1 repair instruction,
  // not an ever-growing transcript of every failed attempt.
  assert.equal(stub.calls[2].messages.length, 4);
  assert.equal(stub.calls[2].messages[2].content, "bad two");
});

test("generation metadata tags each attempt with repairAttempt index", async () => {
  const stub = stubRunLLM([
    { content: "not json" },
    { content: VALID_OUTPUT },
  ]);
  await runStructuredLLM(baseOptions(stub));

  assert.equal(stub.calls[0].generationMetadata.repairAttempt, 0);
  assert.equal(stub.calls[1].generationMetadata.repairAttempt, 1);
});

test("formatZodError produces field paths for nested and root issues", () => {
  const result = cardSchema.safeParse({ summary: 42, redFlag: { severity: "high", reason: null } });
  const msg = formatZodError(result.error);
  assert.match(msg, /summary:/);
  assert.match(msg, /coverageGaps:/);
});

test("buildJsonSchemaResponseFormat emits strict-mode-compatible schema", () => {
  const rf = buildJsonSchemaResponseFormat(cardSchema, "test_schema");
  const schema = rf.json_schema.schema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.redFlag.additionalProperties, false);
  assert.deepEqual(schema.properties.redFlag.required, ["severity", "reason"]);
});

test("real W38 production outputs pass the card schema", () => {
  // Regression fixtures distilled from the W38 run's Langfuse outputs: the
  // exact structural variants the model produces (compact, pretty-printed,
  // null redFlag, populated coverageGaps).
  const fixtures = [
    "{\"summary\":\"Compact single-line form.\",\"redFlag\":{\"severity\":\"low\",\"reason\":\"Mild pattern.\"},\"coverageGaps\":[]}",
    "{\n  \"summary\": \"Pretty-printed form.\\n\\nSecond paragraph.\",\n  \"redFlag\": {\n    \"severity\": null,\n    \"reason\": null\n  },\n  \"coverageGaps\": [\n    \"Mathematics\",\n    \"Sensorial\"\n  ]\n}",
    "{\"summary\":\"Medium severity form.\",\"redFlag\":{\"severity\":\"medium\",\"reason\":\"Below age expectations.\"},\"coverageGaps\":[] }",
  ];
  for (const fixture of fixtures) {
    const result = cardSchema.safeParse(JSON.parse(fixture));
    assert.equal(result.success, true);
  }
});

test("W38 failure modes are rejected", () => {
  // Roohi: unterminated JSON - dies at JSON.parse.
  assert.throws(() => JSON.parse("{\"summary\":\"derailed\",\"bare string with no key\""));

  // Silent-coercion mode the old code shipped: missing redFlag now fails loudly.
  const missingRedFlag = cardSchema.safeParse({ summary: "ok", coverageGaps: [] });
  assert.equal(missingRedFlag.success, false);

  // Wrong enum casing now fails loudly instead of coercing to null severity.
  const wrongCase = cardSchema.safeParse({
    summary: "ok",
    redFlag: { severity: "HIGH", reason: "r" },
    coverageGaps: [],
  });
  assert.equal(wrongCase.success, false);
});

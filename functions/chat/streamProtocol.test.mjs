import test from "node:test";
import assert from "node:assert/strict";

import { encodeSseEvent, consumeSseChunk } from "./streamProtocol.js";

test("encodeSseEvent emits valid SSE framing", () => {
  assert.equal(encodeSseEvent("token", { text: "hello" }), 'event: token\ndata: {"text":"hello"}\n\n');
});

test("consumeSseChunk parses complete events and keeps partial data", () => {
  const first = consumeSseChunk("event: token\ndata: one\n\nevent: token\ndata: tw", "");
  assert.deepEqual(first.events, [{ event: "token", data: "one" }]);
  assert.equal(first.remainder, "event: token\ndata: tw");

  const second = consumeSseChunk(first.remainder, "o\n\n");
  assert.deepEqual(second.events, [{ event: "token", data: "two" }]);
  assert.equal(second.remainder, "");
});

test("consumeSseChunk recognizes the provider done sentinel", () => {
  const result = consumeSseChunk("data: [DONE]\n\n", "");
  assert.deepEqual(result.events, [{ event: "message", data: "[DONE]" }]);
});

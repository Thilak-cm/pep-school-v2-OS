import test from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";

import { encodeSseEvent, consumeSseChunk, writeSseEvent } from "./streamProtocol.js";

test("encodeSseEvent emits valid SSE framing", () => {
  assert.equal(encodeSseEvent("token", { text: "hello" }), 'event: token\ndata: {"text":"hello"}\n\n');
});

test("writeSseEvent counts the UTF-8 bytes actually written to the server stream", () => {
  const writes = [];
  const dimensions = [];
  const res = { writableEnded: false, write: (value) => writes.push(value) };
  const telemetry = { incrementDimensions: (value) => dimensions.push(value) };

  assert.equal(writeSseEvent(res, "token", { text: "Pep 🌶️" }, telemetry), true);
  assert.deepEqual(dimensions, [{
    sseResponseBytes: new TextEncoder().encode(writes[0]).byteLength,
  }]);

  res.writableEnded = true;
  assert.equal(writeSseEvent(res, "complete", {}, telemetry), false);
  assert.equal(writes.length, 1);
  assert.equal(dimensions.length, 1);
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

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { chunkStudentIds, parseSoulWorkerMessage } from "../students/soulFanout.js";

// ---------------------------------------------------------------------------
// chunkStudentIds
// ---------------------------------------------------------------------------

describe("chunkStudentIds", () => {
  test("chunks 13 IDs into groups of 5 → [5, 5, 3]", () => {
    const ids = Array.from({ length: 13 }, (_, i) => `s${i}`);
    const chunks = chunkStudentIds(ids, 5);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 5);
    assert.equal(chunks[1].length, 5);
    assert.equal(chunks[2].length, 3);
    // Verify order preserved
    assert.deepStrictEqual(chunks[0], ["s0", "s1", "s2", "s3", "s4"]);
    assert.deepStrictEqual(chunks[2], ["s10", "s11", "s12"]);
  });

  test("exact multiple: 10 IDs with batchSize 5 → [5, 5]", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`);
    const chunks = chunkStudentIds(ids, 5);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 5);
    assert.equal(chunks[1].length, 5);
  });

  test("smaller than batch: 3 IDs with batchSize 5 → single chunk", () => {
    const chunks = chunkStudentIds(["a", "b", "c"], 5);
    assert.equal(chunks.length, 1);
    assert.deepStrictEqual(chunks[0], ["a", "b", "c"]);
  });

  test("empty array → empty result", () => {
    const chunks = chunkStudentIds([], 5);
    assert.deepStrictEqual(chunks, []);
  });

  test("single item → one chunk with one element", () => {
    const chunks = chunkStudentIds(["abc"], 5);
    assert.equal(chunks.length, 1);
    assert.deepStrictEqual(chunks[0], ["abc"]);
  });

  test("default batchSize is 10", () => {
    const ids = Array.from({ length: 17 }, (_, i) => `s${i}`);
    const chunks = chunkStudentIds(ids);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 10);
    assert.equal(chunks[1].length, 7);
  });
});

// ---------------------------------------------------------------------------
// parseSoulWorkerMessage
// ---------------------------------------------------------------------------

describe("parseSoulWorkerMessage", () => {
  test("parses valid message with studentIds array", () => {
    const message = { json: { studentIds: ["s1", "s2", "s3"] } };
    const result = parseSoulWorkerMessage(message);
    assert.deepStrictEqual(result, { studentIds: ["s1", "s2", "s3"] });
  });

  test("throws on missing JSON payload", () => {
    assert.throws(
      () => parseSoulWorkerMessage({ json: null }),
      /missing or null JSON payload/,
    );
    assert.throws(
      () => parseSoulWorkerMessage({}),
      /missing or null JSON payload/,
    );
  });

  test("throws on missing studentIds field", () => {
    assert.throws(
      () => parseSoulWorkerMessage({ json: { foo: "bar" } }),
      /studentIds is required/,
    );
  });

  test("throws on empty studentIds array", () => {
    assert.throws(
      () => parseSoulWorkerMessage({ json: { studentIds: [] } }),
      /studentIds is required/,
    );
  });
});

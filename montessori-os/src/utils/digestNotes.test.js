import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseNotes, serializeNotes } from "./digestNotes.js";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("parseNotes", () => {
  it("parses bullet-prefixed lines into plain items", () => {
    const raw = "- Diana is admin\n- Anil is support staff";
    assert.deepEqual(parseNotes(raw), ["Diana is admin", "Anil is support staff"]);
  });

  it("handles lines without bullet prefix", () => {
    const raw = "Diana is admin\nAnil is support staff";
    assert.deepEqual(parseNotes(raw), ["Diana is admin", "Anil is support staff"]);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(parseNotes(""), []);
  });

  it("returns empty array for null/undefined", () => {
    assert.deepEqual(parseNotes(null), []);
    assert.deepEqual(parseNotes(undefined), []);
  });

  it("skips blank lines", () => {
    const raw = "- Note one\n\n- Note two\n  \n- Note three";
    assert.deepEqual(parseNotes(raw), ["Note one", "Note two", "Note three"]);
  });
});

describe("serializeNotes", () => {
  it("joins items with bullet prefix and newline", () => {
    const items = ["Diana is admin", "Anil is support staff"];
    assert.equal(serializeNotes(items), "- Diana is admin\n- Anil is support staff");
  });

  it("trims whitespace from items", () => {
    const items = ["  Diana is admin  ", "Anil is support staff"];
    assert.equal(serializeNotes(items), "- Diana is admin\n- Anil is support staff");
  });

  it("filters out empty items", () => {
    const items = ["Diana is admin", "", "Anil is support staff"];
    assert.equal(serializeNotes(items), "- Diana is admin\n- Anil is support staff");
  });

  it("returns empty string for empty array", () => {
    assert.equal(serializeNotes([]), "");
  });
});

describe("round-trip: parse → serialize → parse", () => {
  it("preserves data through round-trip", () => {
    const original = "- Diana is admin\n- Anil is support\n- School on break April–May";
    const parsed = parseNotes(original);
    const serialized = serializeNotes(parsed);
    const reparsed = parseNotes(serialized);
    assert.deepEqual(reparsed, parsed);
  });
});

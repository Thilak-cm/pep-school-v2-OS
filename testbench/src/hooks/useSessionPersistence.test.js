/**
 * #136: Session persistence tests
 *
 * Tests pure functions for sessionStorage-backed variant persistence.
 * Uses a mock sessionStorage since Node.js doesn't have one.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { saveToSession, loadFromSession, clearSession, buildSessionKey } from "./useSessionPersistence.js";

// Mock sessionStorage for Node.js test environment
function createMockStorage() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    get _store() { return store; },
  };
}

describe("buildSessionKey", () => {
  it("builds key from programId and reportType", () => {
    assert.equal(buildSessionKey("primary", "term"), "tb_report_primary_term");
  });

  it("handles monthly report type", () => {
    assert.equal(buildSessionKey("elementary", "monthly"), "tb_report_elementary_monthly");
  });
});

describe("saveToSession", () => {
  let storage;
  beforeEach(() => { storage = createMockStorage(); });

  it("saves variants and metadata under correct key", () => {
    const variants = [{ name: "A", systemPrompt: "p1", output: "out" }];
    saveToSession("primary", "term", variants, "session1", storage);
    const stored = JSON.parse(storage.getItem("tb_report_primary_term"));
    assert.equal(stored.programId, "primary");
    assert.equal(stored.reportType, "term");
    assert.equal(stored.sessionName, "session1");
    assert.deepEqual(stored.variants, variants);
  });

  it("stores a timestamp", () => {
    saveToSession("elementary", "monthly", [], "", storage);
    const stored = JSON.parse(storage.getItem("tb_report_elementary_monthly"));
    assert.ok(stored.savedAt);
    assert.ok(typeof stored.savedAt === "number");
  });
});

describe("loadFromSession", () => {
  let storage;
  beforeEach(() => { storage = createMockStorage(); });

  it("returns null when no session exists", () => {
    assert.equal(loadFromSession("primary", "term", storage), null);
  });

  it("returns saved data when session exists", () => {
    const variants = [{ name: "A", systemPrompt: "p1" }];
    saveToSession("primary", "term", variants, "test", storage);
    const loaded = loadFromSession("primary", "term", storage);
    assert.equal(loaded.programId, "primary");
    assert.deepEqual(loaded.variants, variants);
  });

  it("returns null for invalid JSON", () => {
    storage.setItem("tb_report_primary_term", "not-json");
    assert.equal(loadFromSession("primary", "term", storage), null);
  });
});

describe("clearSession", () => {
  let storage;
  beforeEach(() => { storage = createMockStorage(); });

  it("removes the session key", () => {
    saveToSession("primary", "term", [], "", storage);
    assert.ok(storage.getItem("tb_report_primary_term"));
    clearSession("primary", "term", storage);
    assert.equal(storage.getItem("tb_report_primary_term"), null);
  });

  it("does not throw when key does not exist", () => {
    assert.doesNotThrow(() => clearSession("primary", "term", storage));
  });
});

describe("round-trip", () => {
  let storage;
  beforeEach(() => { storage = createMockStorage(); });

  it("save then load returns same variants", () => {
    const variants = [
      { name: "Variant A", systemPrompt: "prompt1", model: "gpt-5.4", temperature: 0.4 },
      { name: "Variant B", systemPrompt: "prompt2", model: "gpt-5.4", temperature: 0.7 },
    ];
    saveToSession("adolescent", "monthly", variants, "my session", storage);
    const loaded = loadFromSession("adolescent", "monthly", storage);
    assert.deepEqual(loaded.variants, variants);
    assert.equal(loaded.sessionName, "my session");
  });

  it("different keys do not collide", () => {
    saveToSession("primary", "term", [{ name: "A" }], "", storage);
    saveToSession("primary", "monthly", [{ name: "B" }], "", storage);
    const term = loadFromSession("primary", "term", storage);
    const monthly = loadFromSession("primary", "monthly", storage);
    assert.equal(term.variants[0].name, "A");
    assert.equal(monthly.variants[0].name, "B");
  });

  it("clear then load returns null", () => {
    saveToSession("primary", "term", [{ name: "A" }], "", storage);
    clearSession("primary", "term", storage);
    assert.equal(loadFromSession("primary", "term", storage), null);
  });
});

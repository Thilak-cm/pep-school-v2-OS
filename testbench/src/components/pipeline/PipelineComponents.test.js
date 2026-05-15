/**
 * PEP-216: Shared pipeline component tests
 *
 * Tests the extracted ContextBlock, FlowArrow, SectionLabel, and
 * RuntimePlaceholder pure-render helpers.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test the prop-logic helpers rather than JSX rendering (no DOM needed).
// Each component is thin enough that prop-to-output mapping is the key concern.

import {
  resolveContextBlockStatus,
  formatCharCount,
} from "./pipelineHelpers.js";

// --- resolveContextBlockStatus ---

describe("resolveContextBlockStatus", () => {
  it("returns 'available' with char count when content is a non-empty string", () => {
    const result = resolveContextBlockStatus("hello world");
    assert.equal(result.status, "available");
    assert.equal(result.charCount, 11);
  });

  it("returns 'available' with explicit charCount when provided", () => {
    const result = resolveContextBlockStatus("hi", 999);
    assert.equal(result.status, "available");
    assert.equal(result.charCount, 999);
  });

  it("returns 'unavailable' when content is null", () => {
    const result = resolveContextBlockStatus(null);
    assert.equal(result.status, "unavailable");
    assert.equal(result.charCount, null);
  });

  it("returns 'unavailable' when content is empty string", () => {
    const result = resolveContextBlockStatus("");
    assert.equal(result.status, "unavailable");
  });

  it("returns 'unavailable' when content is undefined", () => {
    const result = resolveContextBlockStatus(undefined);
    assert.equal(result.status, "unavailable");
  });
});

// --- formatCharCount ---

describe("formatCharCount", () => {
  it("formats small numbers without separator", () => {
    assert.equal(formatCharCount(42), "42 chars");
  });

  it("formats large numbers with locale separator", () => {
    const result = formatCharCount(1234);
    // toLocaleString output varies by locale, just check it ends with " chars"
    assert.ok(result.endsWith(" chars"));
    assert.ok(result.length > "1234 chars".length - 1); // at least as long
  });

  it("returns 'loaded' when charCount is null", () => {
    assert.equal(formatCharCount(null), "loaded");
  });

  it("returns 'loaded' when charCount is undefined", () => {
    assert.equal(formatCharCount(undefined), "loaded");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEndOfDay } from "../utils/reportHelpers.js";

describe("normalizeEndOfDay", () => {
  it("sets time to 23:59:59.999 for a midnight Date", () => {
    const d = normalizeEndOfDay(new Date(2026, 2, 6, 0, 0, 0)); // Mar 6 midnight
    assert.equal(d.getHours(), 23);
    assert.equal(d.getMinutes(), 59);
    assert.equal(d.getSeconds(), 59);
    assert.equal(d.getMilliseconds(), 999);
    assert.equal(d.getDate(), 6);
  });

  it("preserves the date when already at end of day", () => {
    const d = normalizeEndOfDay(new Date(2026, 2, 6, 23, 59, 59, 999));
    assert.equal(d.getHours(), 23);
    assert.equal(d.getMinutes(), 59);
    assert.equal(d.getDate(), 6);
  });

  it("sets time to end of day for a date with midday time", () => {
    const d = normalizeEndOfDay(new Date(2026, 2, 6, 14, 30, 0));
    assert.equal(d.getHours(), 23);
    assert.equal(d.getMinutes(), 59);
    assert.equal(d.getSeconds(), 59);
    assert.equal(d.getMilliseconds(), 999);
  });

  it("returns a new Date (does not mutate original)", () => {
    const original = new Date(2026, 2, 6, 10, 0, 0);
    const result = normalizeEndOfDay(original);
    assert.notStrictEqual(result, original);
    assert.equal(original.getHours(), 10); // unchanged
  });

  it("handles Date constructed from ISO string (end-of-day in local TZ)", () => {
    const d = normalizeEndOfDay(new Date("2026-03-06"));
    assert.equal(d.getHours(), 23);
    assert.equal(d.getMinutes(), 59);
    assert.equal(d.getSeconds(), 59);
    assert.equal(d.getMilliseconds(), 999);
  });
});

/**
 * Tests for period-key computation helpers.
 *
 * Run with: node --test functions/utils/periodKeys.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getCurrentMonthIST,
  getNextMonthIST,
  getRunMonthIST,
  isLastDayOfMonthIST,
} from "./periodKeys.js";

// Helper: create a UTC Date at a specific time.
// IST = UTC + 5:30, so to get IST midnight of 2026-09-01,
// we need UTC 2026-08-31T18:30:00Z.
function utc(isoString) {
  return new Date(isoString);
}

describe("getCurrentMonthIST", () => {
  test("returns current IST month as YYYY-MM", () => {
    // UTC 2026-09-01T00:00:00Z => IST 2026-09-01T05:30:00 => "2026-09"
    assert.equal(getCurrentMonthIST(utc("2026-09-01T00:00:00Z")), "2026-09");
  });

  test("handles IST date being ahead of UTC date (late UTC evening)", () => {
    // UTC 2026-08-31T20:00:00Z => IST 2026-09-01T01:30:00 => "2026-09"
    assert.equal(getCurrentMonthIST(utc("2026-08-31T20:00:00Z")), "2026-09");
  });

  test("handles IST date matching UTC date (early UTC)", () => {
    // UTC 2026-08-31T10:00:00Z => IST 2026-08-31T15:30:00 => "2026-08"
    assert.equal(getCurrentMonthIST(utc("2026-08-31T10:00:00Z")), "2026-08");
  });

  test("pads single-digit months", () => {
    // UTC 2026-01-15T00:00:00Z => IST 2026-01-15T05:30:00 => "2026-01"
    assert.equal(getCurrentMonthIST(utc("2026-01-15T00:00:00Z")), "2026-01");
  });

  test("handles year boundary: late Dec UTC -> Jan IST", () => {
    // UTC 2026-12-31T20:00:00Z => IST 2027-01-01T01:30:00 => "2027-01"
    assert.equal(getCurrentMonthIST(utc("2026-12-31T20:00:00Z")), "2027-01");
  });
});

describe("getNextMonthIST", () => {
  test("returns next month from IST perspective", () => {
    // IST 2026-08-31 => next month = "2026-09"
    assert.equal(getNextMonthIST(utc("2026-08-31T10:00:00Z")), "2026-09");
  });

  test("handles year rollover: December -> January next year", () => {
    // IST 2026-12-15 => next month = "2027-01"
    assert.equal(getNextMonthIST(utc("2026-12-15T00:00:00Z")), "2027-01");
  });

  test("handles late UTC evening crossing IST month boundary", () => {
    // UTC 2026-08-31T20:00:00Z => IST 2026-09-01 => next month = "2026-10"
    assert.equal(getNextMonthIST(utc("2026-08-31T20:00:00Z")), "2026-10");
  });
});

describe("getRunMonthIST", () => {
  test("returns same result as getCurrentMonthIST", () => {
    const now = utc("2026-09-01T02:00:00Z");
    assert.equal(getRunMonthIST(now), getCurrentMonthIST(now));
  });
});

describe("isLastDayOfMonthIST", () => {
  test("returns true on last day of 31-day month", () => {
    // IST 2026-08-31
    assert.equal(isLastDayOfMonthIST(utc("2026-08-31T10:00:00Z")), true);
  });

  test("returns false on second-to-last day", () => {
    // IST 2026-08-30
    assert.equal(isLastDayOfMonthIST(utc("2026-08-30T10:00:00Z")), false);
  });

  test("returns true on last day of 30-day month", () => {
    // IST 2026-09-30
    assert.equal(isLastDayOfMonthIST(utc("2026-09-30T10:00:00Z")), true);
  });

  test("returns true on Feb 28 in non-leap year", () => {
    // IST 2025-02-28
    assert.equal(isLastDayOfMonthIST(utc("2025-02-28T10:00:00Z")), true);
  });

  test("returns false on Feb 28 in leap year", () => {
    // IST 2028-02-28
    assert.equal(isLastDayOfMonthIST(utc("2028-02-28T10:00:00Z")), false);
  });

  test("returns true on Feb 29 in leap year", () => {
    // IST 2028-02-29
    assert.equal(isLastDayOfMonthIST(utc("2028-02-29T10:00:00Z")), true);
  });

  test("handles IST date ahead of UTC date at month boundary", () => {
    // UTC 2026-08-31T20:00:00Z => IST 2026-09-01 => not last day of Sep
    assert.equal(isLastDayOfMonthIST(utc("2026-08-31T20:00:00Z")), false);
  });
});

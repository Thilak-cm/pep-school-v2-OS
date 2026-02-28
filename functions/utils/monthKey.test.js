import test from "node:test";
import assert from "node:assert/strict";

import { getIstMonthKey, getMonthWindowDates } from "./monthKey.js";

// --- getIstMonthKey ---

test("monthKey: mid-month date returns correct key", () => {
  const date = new Date("2026-06-15T12:00:00Z");
  assert.equal(getIstMonthKey(date), "2026-06");
});

test("monthKey: January returns zero-padded month", () => {
  const date = new Date("2026-01-10T12:00:00Z");
  assert.equal(getIstMonthKey(date), "2026-01");
});

test("monthKey: December returns 12", () => {
  const date = new Date("2026-12-15T12:00:00Z");
  assert.equal(getIstMonthKey(date), "2026-12");
});

test("monthKey: IST boundary — late UTC night rolls to next month in IST", () => {
  // Jan 31 2026 21:00 UTC → Feb 1 2026 02:30 IST
  const date = new Date("2026-01-31T21:00:00Z");
  assert.equal(getIstMonthKey(date), "2026-02");
});

test("monthKey: IST boundary — early UTC stays in same month", () => {
  // Feb 1 2026 05:00 UTC → Feb 1 2026 10:30 IST (still Feb)
  const date = new Date("2026-02-01T05:00:00Z");
  assert.equal(getIstMonthKey(date), "2026-02");
});

test("monthKey: format is always YYYY-MM", () => {
  const key = getIstMonthKey(new Date("2026-03-15T12:00:00Z"));
  assert.match(key, /^\d{4}-\d{2}$/);
});

// --- getMonthWindowDates ---

test("getMonthWindowDates: returns correct start/end for Feb 2026", () => {
  const { start, end } = getMonthWindowDates("2026-02");
  // Start: Feb 1 2026 00:00:00 IST = Jan 31 2026 18:30:00 UTC
  assert.equal(start.toISOString(), "2026-01-31T18:30:00.000Z");
  // End: Mar 1 2026 00:00:00 IST = Feb 28 2026 18:30:00 UTC
  assert.equal(end.toISOString(), "2026-02-28T18:30:00.000Z");
});

test("getMonthWindowDates: returns correct start/end for Jan 2026", () => {
  const jan = getMonthWindowDates("2026-01");
  // Start: Jan 1 2026 00:00:00 IST = Dec 31 2025 18:30:00 UTC
  assert.equal(jan.start.toISOString(), "2025-12-31T18:30:00.000Z");
  // End: Feb 1 2026 00:00:00 IST = Jan 31 2026 18:30:00 UTC
  assert.equal(jan.end.toISOString(), "2026-01-31T18:30:00.000Z");
});

test("getMonthWindowDates: leap year Feb 2028", () => {
  const leap = getMonthWindowDates("2028-02");
  // Start: Feb 1 2028 00:00:00 IST = Jan 31 2028 18:30:00 UTC
  assert.equal(leap.start.toISOString(), "2028-01-31T18:30:00.000Z");
  // End: Mar 1 2028 00:00:00 IST = Feb 29 2028 18:30:00 UTC
  assert.equal(leap.end.toISOString(), "2028-02-29T18:30:00.000Z");
});

test("getMonthWindowDates: December wraps to next year", () => {
  const { start, end } = getMonthWindowDates("2026-12");
  // Start: Dec 1 2026 00:00:00 IST = Nov 30 2026 18:30:00 UTC
  assert.equal(start.toISOString(), "2026-11-30T18:30:00.000Z");
  // End: Jan 1 2027 00:00:00 IST = Dec 31 2026 18:30:00 UTC
  assert.equal(end.toISOString(), "2026-12-31T18:30:00.000Z");
});

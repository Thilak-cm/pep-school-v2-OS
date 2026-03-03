const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Returns an IST month key like "2026-02" for the given date.
 * @param {Date} [date]
 * @returns {string}
 */
export function getIstMonthKey(date = new Date()) {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Returns UTC Date objects for the start and end of a given IST month.
 * Start = 1st of month 00:00:00 IST (as UTC)
 * End = 1st of next month 00:00:00 IST (as UTC) — exclusive upper bound
 * @param {string} monthKey - "YYYY-MM"
 * @returns {{ start: Date, end: Date }}
 */
export function getMonthWindowDates(monthKey) {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-based

  // 1st of month 00:00:00 IST → subtract IST offset to get UTC
  const startUtc = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);

  // 1st of next month 00:00:00 IST → subtract IST offset to get UTC
  const endUtc = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);

  return { start: startUtc, end: endUtc };
}

/**
 * Shared helpers for stats computation (PEP-285).
 *
 * classifyNote   — single source of truth for observation type classification
 * getObservationDate — Firestore Timestamp → Date with fallbacks
 * buildActivityTiers — bucket observations into daily / weekly / monthly maps
 */

/** Cache TTL in milliseconds (30 minutes). */
export const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Classify an observation into exactly one type.
 * Order matters — lesson > voice > text > media. Anything unmatched → "other".
 *
 * @param {Object} obs - Observation or media document
 * @returns {"lesson"|"voice"|"text"|"media"|"other"}
 */
export function classifyNote(obs) {
  if (!obs) return "other";

  // Lesson: explicit type or has lessonTitle
  if (obs.type === "lesson" || obs.lessonTitle) return "lesson";

  // Voice: explicit type, tag, or has duration (and not a lesson)
  if (
    obs.type === "voice" ||
    obs.tags?.type === "voice" ||
    (Array.isArray(obs.tags) && obs.tags.includes("voice")) ||
    obs.duration
  ) {
    return "voice";
  }

  // Text: explicit type, tag, or has text content without duration
  if (
    obs.type === "text" ||
    obs.tags?.type === "text" ||
    (Array.isArray(obs.tags) && obs.tags.includes("text")) ||
    (!obs.duration && obs.text)
  ) {
    return "text";
  }

  // Media: explicit type
  if (obs.type === "media") return "media";

  return "other";
}

/**
 * Extract a JS Date from an observation's timestamp fields.
 * Handles Firestore Timestamps (with .toDate()), serialized timestamps
 * (with .seconds), and plain Date objects.
 *
 * @param {Object} obs - Observation document
 * @returns {Date}
 */
export function getObservationDate(obs) {
  if (!obs) return new Date(0);

  const raw = obs.observedAt || obs.createdAt;
  if (!raw) return new Date(0);

  // Firestore Timestamp
  if (typeof raw.toDate === "function") return raw.toDate();

  // Serialized Timestamp ({ seconds, nanoseconds })
  if (raw.seconds != null) return new Date(raw.seconds * 1000);

  // Already a Date or date string
  if (raw instanceof Date) return raw;
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }

  return new Date(0);
}

/**
 * Bucket observations into tiered activity maps.
 *
 * Returns:
 *   daily   — { "YYYY-MM-DD": count } for the last 30 days
 *   weekly  — { "YYYY-Www": count }   for the last 12 weeks
 *   monthly — { "YYYY-MM": count }    for the last 12 months
 *
 * @param {Object[]} observations - Array of observation docs
 * @param {Date}     [now]        - Reference time (default: new Date())
 * @returns {{ daily: Object, weekly: Object, monthly: Object }}
 */
export function buildActivityTiers(observations, now = new Date()) {
  const daily = {};
  const weekly = {};
  const monthly = {};

  // Pre-compute cutoff dates
  const dayMs = 24 * 60 * 60 * 1000;
  const dailyCutoff = new Date(now.getTime() - 30 * dayMs);
  const weeklyCutoff = new Date(now.getTime() - 12 * 7 * dayMs);
  const monthlyCutoff = new Date(
    now.getFullYear(),
    now.getMonth() - 11,
    1
  );

  // Initialize all daily buckets (last 30 days)
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * dayMs);
    daily[formatDateKey(d)] = 0;
  }

  // Initialize all weekly buckets (last 12 weeks)
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getTime() - i * 7 * dayMs);
    weekly[formatWeekKey(d)] = 0;
  }

  // Initialize all monthly buckets (last 12 months)
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthly[formatMonthKey(d)] = 0;
  }

  // Single pass through observations
  for (const obs of observations) {
    const date = getObservationDate(obs);
    if (date.getTime() === 0) continue; // skip invalid dates

    if (date >= dailyCutoff) {
      const key = formatDateKey(date);
      if (key in daily) daily[key]++;
    }

    if (date >= weeklyCutoff) {
      const key = formatWeekKey(date);
      if (key in weekly) weekly[key]++;
    }

    if (date >= monthlyCutoff) {
      const key = formatMonthKey(date);
      if (key in monthly) monthly[key]++;
    }
  }

  return {daily, weekly, monthly};
}

// ── Date formatting helpers ──────────────────────────────────────────

/** "YYYY-MM-DD" */
function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-Www" (ISO week number) */
function formatWeekKey(d) {
  const y = d.getFullYear();
  const wk = String(getISOWeek(d)).padStart(2, "0");
  return `${y}-W${wk}`;
}

/** "YYYY-MM" */
function formatMonthKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** ISO 8601 week number. */
function getISOWeek(d) {
  const date = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  );
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

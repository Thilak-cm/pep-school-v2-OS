/**
 * Shared helpers for stats computation (PEP-285).
 *
 * classifyNote   — single source of truth for observation type classification
 * getObservationDate — Firestore Timestamp → Date with fallbacks
 */

/**
 * Classify an observation into exactly one type.
 * Order matters — lesson > voice > text > media. Anything unmatched → "other".
 *
 * @param {Object} obs - Observation or media document
 * @returns {"lesson"|"voice"|"text"|"media"|"assessment"|"other"}
 */
export function classifyNote(obs) {
  if (!obs) return "other";

  if (obs.type === "assessment" || obs.assessmentKind) return "assessment";

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

/** Operational upload records are excluded until their file is ready. */
export function isStatsEligibleNote(obs) {
  if (!obs) return false;
  if (obs.type === "media") return obs.status === "ready";
  if (obs.type === "assessment" && obs.assessmentKind === "medical") {
    return obs.uploadStatus === "ready";
  }
  return true;
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

/** Create zero-filled graph buckets for the currently visible windows. */
export function createActivityTiers(now = new Date()) {
  const daily = {};
  const weekly = {};
  const monthly = {};

  const dayMs = 24 * 60 * 60 * 1000;

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

  return {daily, weekly, monthly};
}

/** Add one observation to an existing current-window graph aggregate. */
export function incrementActivityTiers(tiers, observation, now = new Date()) {
  const date = getObservationDate(observation);
  if (date.getTime() === 0) return tiers;
  const dayMs = 24 * 60 * 60 * 1000;
  const dailyCutoff = new Date(now.getTime() - 30 * dayMs);
  const weeklyCutoff = new Date(now.getTime() - 12 * 7 * dayMs);
  const monthlyCutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  if (date >= dailyCutoff) {
    const key = formatDateKey(date);
    if (key in tiers.daily) tiers.daily[key]++;
  }
  if (date >= weeklyCutoff) {
    const key = formatWeekKey(date);
    if (key in tiers.weekly) tiers.weekly[key]++;
  }
  if (date >= monthlyCutoff) {
    const key = formatMonthKey(date);
    if (key in tiers.monthly) tiers.monthly[key]++;
  }
  return tiers;
}

/** Drop expired graph keys while preserving counts still in visible buckets. */
export function normalizeActivityTiers(existing = {}, now = new Date()) {
  const normalized = createActivityTiers(now);
  for (const tier of ["daily", "weekly", "monthly"]) {
    for (const key of Object.keys(normalized[tier])) {
      normalized[tier][key] = existing?.[tier]?.[key] || 0;
    }
  }
  return normalized;
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

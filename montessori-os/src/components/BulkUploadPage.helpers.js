import jaroWinkler from 'jaro-winkler';

// Three-zone classification (Fellegi-Sunter record linkage model, #285):
// auto = high-confidence match resolved without teacher interaction,
// review = pre-selected best match with candidates for one-tap correction,
// none = no credible match; teacher must pick manually.
export const ZONE = {
  AUTO: 'auto',
  REVIEW: 'review',
  NONE: 'none',
};

// Jaro-Winkler thresholds follow US Census / Splink conventions for person
// names (>=0.95 confident, 0.85-0.95 clerical review, 0.8 admits false
// positives). Structural constants, deliberately NOT Firestore config - see
// issue #285 "Decisions Made". Misattribution to the wrong student is the
// worst failure mode, so thresholds stay conservative.
export const JW_AUTO = 0.95;
export const JW_REVIEW_FLOOR = 0.85;
export const JW_MARGIN = 0.05; // top must beat runner-up by this to auto-match
export const JW_SUGGEST_FLOOR = 0.70; // weak suggestions shown on none-zone rows

const MAX_CANDIDATES = 3;

// Leading honorifics only - stripping tokens mid-name would corrupt real names.
const HONORIFICS = new Set(['master', 'baby', 'mr', 'mrs', 'ms', 'miss']);

/**
 * Normalize a person name for comparison: trim, lowercase, strip diacritics
 * (NFD) and punctuation, drop a leading honorific token, collapse whitespace.
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  const cleaned = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const tokens = cleaned.split(' ');
  if (tokens.length > 1 && HONORIFICS.has(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

const tokenSort = (normalized) => normalized.split(' ').sort().join(' ');

/**
 * Shared pool filter: active students only, optionally narrowed to one
 * classroom or a set of classrooms. Inactive/graduated/transferred students
 * must never be match candidates - enforced here so every upload flow gets
 * the same safety invariant regardless of how its pool was fetched.
 * @param {object[]} students
 * @param {{ classroomId?: string, programClassroomIds?: string[] }} [filter]
 * @returns {object[]}
 */
export function filterStudentPool(students, filter = {}) {
  let pool = (students || []).filter((s) => !s.status || s.status === 'active');
  if (filter.classroomId) {
    pool = pool.filter((s) => s.classroomId === filter.classroomId);
  } else if (filter.programClassroomIds) {
    const ids = new Set(filter.programClassroomIds);
    pool = pool.filter((s) => ids.has(s.classroomId));
  }
  return pool;
}

/**
 * Best Jaro-Winkler similarity between a source name and one student.
 * Single-token sources compare against firstName AND full name (teachers
 * usually write first names); multi-token sources compare token-sorted so
 * word order never penalizes ("Kumar Aarav" == "Aarav Kumar").
 */
function studentSimilarity(source, student) {
  const first = normalizeName(student.firstName);
  const full = tokenSort(normalizeName(student.displayName));
  const sorted = tokenSort(source);
  let best = 0;
  if (first) best = Math.max(best, jaroWinkler(source, first));
  if (full) best = Math.max(best, jaroWinkler(sorted, full));
  return best;
}

/**
 * Match source-sheet student names against roster records.
 *
 * Deterministic-first tier ladder, then Jaro-Winkler fuzzy fallback with
 * three-zone classification (see constants above). Tiers:
 *   exact-full      - token-sorted full name equals exactly one student
 *   exact-first     - single-token source equals exactly one firstName
 *   ambiguous-first - single-token source equals multiple firstNames
 *   fuzzy           - Jaro-Winkler zones with relative-margin ambiguity test
 *
 * @param {string[]} csvNames - unique student names from the sheet
 * @param {object[]} students - student records from Firestore
 * @param {{ classroomId?: string, programClassroomIds?: string[] }} [filter]
 * @returns {Array<{ csvName: string, match: object|null, zone: string, tier: string, candidates: object[] }>}
 */
export function matchStudentNames(csvNames, students, filter = {}) {
  const pool = filterStudentPool(students, filter);

  return csvNames.map((csvName) => {
    const source = normalizeName(csvName);
    if (!source || pool.length === 0) {
      return { csvName, match: null, zone: ZONE.NONE, tier: 'none', candidates: [] };
    }

    const tokens = source.split(' ');

    // Tier 1: exact full name (token-sorted). Unique -> auto; duplicates fall
    // through to fuzzy, where identical scores trip the margin test -> review.
    if (tokens.length > 1) {
      const sorted = tokenSort(source);
      const exact = pool.filter((s) => tokenSort(normalizeName(s.displayName)) === sorted);
      if (exact.length === 1) {
        return { csvName, match: exact[0], zone: ZONE.AUTO, tier: 'exact-full', candidates: [exact[0]] };
      }
    }

    // Tier 2: single-token exact firstName. Unique -> auto. Non-unique ->
    // review with exactly those students as candidates (not fuzzy noise);
    // first in pool order is pre-selected.
    else if (tokens.length === 1) {
      const exact = pool.filter((s) => normalizeName(s.firstName) === source);
      if (exact.length === 1) {
        return { csvName, match: exact[0], zone: ZONE.AUTO, tier: 'exact-first', candidates: [exact[0]] };
      }
      if (exact.length > 1) {
        return { csvName, match: exact[0], zone: ZONE.REVIEW, tier: 'ambiguous-first', candidates: exact };
      }
    }

    // Tier 3: fuzzy fallback (Jaro-Winkler three-zone with margin test).
    const scored = pool
      .map((s) => ({ student: s, score: studentSimilarity(source, s) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];
    const margin = best.score - (runnerUp ? runnerUp.score : 0);

    if (best.score >= JW_AUTO && margin >= JW_MARGIN) {
      return { csvName, match: best.student, zone: ZONE.AUTO, tier: 'fuzzy', candidates: [best.student] };
    }
    if (best.score >= JW_REVIEW_FLOOR) {
      const candidates = scored
        .filter((c) => c.score >= JW_REVIEW_FLOOR)
        .slice(0, MAX_CANDIDATES)
        .map((c) => c.student);
      return { csvName, match: best.student, zone: ZONE.REVIEW, tier: 'fuzzy', candidates };
    }
    const suggestions = scored
      .filter((c) => c.score >= JW_SUGGEST_FLOOR)
      .slice(0, MAX_CANDIDATES)
      .map((c) => c.student);
    return { csvName, match: null, zone: ZONE.NONE, tier: 'fuzzy', candidates: suggestions };
  });
}

/**
 * Build an observation doc for a text-type CSV row.
 * @param {object} params
 * @returns {object} Firestore-ready observation data (without serverTimestamp)
 */
export function buildObservationDoc({ studentId, classroomId, branchId, text, date, currentUser, groupId }) {
  const now = new Date();
  const observedAt = date ? new Date(date + 'T00:00:00') : now;
  const doc = {
    studentId,
    classroomId,
    branchId: branchId || null,
    type: 'text',
    text,
    observedAt,
    createdAt: now,
    updatedAt: now,
    createdBy: currentUser.uid,
    createdByName: currentUser.displayName || 'Unknown',
    createdByEmail: currentUser.email || '',
  };
  if (groupId) doc.groupId = groupId;
  return doc;
}

/**
 * Build a lesson observation doc for a lesson-type CSV row.
 * Simplified structure — no ratings/dimensions since CSV only has title + date.
 * @param {object} params
 * @returns {object} Firestore-ready lesson observation data
 */
export function buildLessonDoc({ studentId, classroomId, branchId, programId, lessonTitle, date, currentUser, groupId }) {
  const now = new Date();
  const observedAt = date ? new Date(date + 'T00:00:00') : now;
  const doc = {
    studentId,
    classroomId,
    branchId: branchId || null,
    type: 'lesson',
    lessonTitle,
    programId: programId || null,
    attendanceStatus: 'present',
    observedAt,
    createdAt: now,
    updatedAt: now,
    createdBy: currentUser.uid,
    createdByName: currentUser.displayName || 'Unknown',
    createdByEmail: currentUser.email || '',
  };
  if (groupId) doc.groupId = groupId;
  return doc;
}

/**
 * Check rows against existing observations for potential duplicates.
 * A duplicate = same studentId + same date + same content.
 * @param {object[]} rows - { studentId, date, content, type }
 * @param {object[]} existingObs - existing observation docs from Firestore
 * @returns {object[]} rows with isDuplicate flag
 */
export function checkDuplicates(rows, existingObs) {
  const existingKeys = new Set();
  for (const obs of existingObs) {
    const dateStr = obs.observedAt instanceof Date
      ? obs.observedAt.toISOString().slice(0, 10)
      : '';
    const content = obs.type === 'lesson' ? obs.lessonTitle : obs.text;
    existingKeys.add(`${obs.studentId}|${dateStr}|${(content || '').toLowerCase()}`);
  }

  return rows.map((row) => {
    const key = `${row.studentId}|${row.date}|${(row.content || '').toLowerCase()}`;
    return { ...row, isDuplicate: existingKeys.has(key) };
  });
}

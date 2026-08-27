import { createFuzzySearch } from '../utils/fuzzySearch';

export const CONFIDENCE = {
  HIGH: 'high',     // score < 0.2 (Fuse: 0 = perfect)
  MEDIUM: 'medium', // score 0.2 – 0.45
  LOW: 'low',       // score > 0.45 or no match
};

const HIGH_THRESHOLD = 0.2;
const MEDIUM_THRESHOLD = 0.45;

/**
 * Match CSV student names against database student records using fuzzy search.
 * @param {string[]} csvNames - unique student names from CSV
 * @param {object[]} students - student records from Firestore
 * @param {object} [filter] - optional classroom filters and requireUniqueBest
 * @returns {Array<{ csvName: string, match: object|null, score: number, confidence: string, candidates: object[] }>}
 */
export function matchStudentNames(csvNames, students, filter = {}) {
  // Inactive, graduated, and transferred students must never be candidates
  // for name matching. This is enforced here so every upload flow gets the
  // same safety invariant, regardless of how its student pool was fetched.
  let pool = (students || []).filter((student) => !student.status || student.status === 'active');
  if (filter.classroomId) {
    pool = pool.filter((s) => s.classroomId === filter.classroomId);
  } else if (filter.programClassroomIds) {
    const ids = new Set(filter.programClassroomIds);
    pool = pool.filter((s) => ids.has(s.classroomId));
  }

  const fuse = createFuzzySearch(pool, {
    keys: [
      { name: 'displayName', weight: 1.0 },
      { name: 'firstName', weight: 0.8 },
      { name: 'lastName', weight: 0.8 },
    ],
    threshold: 0.5, // broader than default to catch more candidates
  });

  return csvNames.map((csvName) => {
    const results = fuse.search(csvName);
    if (results.length === 0) {
      return { csvName, match: null, score: 1, confidence: CONFIDENCE.LOW, candidates: [] };
    }

    const best = results[0];
    const score = best.score;
    const tiedBest = filter.requireUniqueBest === true && results.length > 1
      && Math.abs((results[1].score ?? 1) - (score ?? 1)) < 0.001;
    let confidence;
    if (tiedBest) confidence = CONFIDENCE.LOW;
    else if (score < HIGH_THRESHOLD) confidence = CONFIDENCE.HIGH;
    else if (score < MEDIUM_THRESHOLD) confidence = CONFIDENCE.MEDIUM;
    else confidence = CONFIDENCE.LOW;

    return {
      csvName,
      match: tiedBest ? null : best.item,
      score,
      confidence,
      ambiguous: tiedBest,
      candidates: results.slice(0, 5).map((r) => ({ ...r.item, _score: r.score })),
    };
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

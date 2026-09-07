/**
 * Pure helpers for the writingAnalysis W30-W36 backfill script (#281).
 * No Firebase or network dependencies - all logic is testable in isolation.
 *
 * Provenance: doc shapes mirror functions/ai/handwriting.js:297-309.
 */

import { getIstIsoWeekKey } from "../../functions/utils/weekKey.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The 7 weeks to backfill, in order. */
export const TARGET_WEEKS = [
  "2026-W30", "2026-W31", "2026-W32", "2026-W33",
  "2026-W34", "2026-W35", "2026-W36",
];

// ---------------------------------------------------------------------------
// Week / time helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ISO week key ("2026-W30") to the simulated run time:
 * Sunday 00:30 IST of that week = Saturday 19:00 UTC.
 *
 * The production CF fires at "30 0 * * 0" Asia/Kolkata, which is Sunday 00:30 IST.
 * We replicate that exact moment for faithful backfill simulation.
 */
export function getSimulatedRunTime(weekKey) {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid week key: ${weekKey}`);

  const year = Number(match[1]);
  const week = Number(match[2]);

  // ISO week 1 contains Jan 4. Find the Monday of week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = (jan4.getUTCDay() + 6) % 7; // Monday=0
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4DayOfWeek);

  // Monday of target week
  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);

  // Sunday of target week = Monday + 6 days
  const sundayTarget = new Date(mondayTarget);
  sundayTarget.setUTCDate(mondayTarget.getUTCDate() + 6);

  // Sunday 00:30 IST = Saturday 19:00 UTC = Sunday minus 5 hours
  // IST is UTC+5:30, so 00:30 IST = 19:00 UTC previous day
  const simulatedTime = new Date(Date.UTC(
    sundayTarget.getUTCFullYear(),
    sundayTarget.getUTCMonth(),
    sundayTarget.getUTCDate() - 1, // Saturday
    19, 0, 0, 0, // 19:00 UTC
  ));

  return simulatedTime;
}

/**
 * Filter media docs to those with observedAt strictly before the cutoff.
 * Faithful simulation: the real CF sees only media that existed before run time.
 */
export function filterMediaForWeek(docs, cutoff) {
  return docs.filter((doc) => doc.observedAt < cutoff);
}

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

/**
 * Derive the week-based history key for a doc.
 * Uses periodKey if present (post-#229 docs), otherwise derives from generatedAt.
 */
export function deriveHistoryKey(docData) {
  if (docData.periodKey) return docData.periodKey;

  const generatedAt = docData.generatedAt;
  if (!generatedAt) throw new Error("Cannot derive history key: no periodKey or generatedAt");

  const date = typeof generatedAt.toDate === "function"
    ? generatedAt.toDate()
    : new Date(generatedAt);

  return getIstIsoWeekKey(date);
}

/**
 * Plan the re-keying of history doc IDs from generatedAt-ISO to week keys.
 * Returns [{oldId, newId}] for entries that need renaming.
 * Throws on collision (two entries map to the same week key).
 */
export function planHistoryRekey(entries) {
  const plan = [];
  const seen = new Map(); // newId -> oldId, for collision detection

  for (const entry of entries) {
    const newId = deriveHistoryKey(entry.data);

    // Already correctly keyed
    if (entry.id === newId) continue;

    // Collision check
    if (seen.has(newId)) {
      throw new Error(
        `History re-key collision: both "${seen.get(newId)}" and "${entry.id}" ` +
        `map to "${newId}". Manual inspection required.`,
      );
    }
    seen.set(newId, entry.id);

    plan.push({ oldId: entry.id, newId });
  }

  return plan;
}

/**
 * Timestamp-aware deep equality for Firestore doc comparisons.
 * Converts Timestamp-like objects via toDate() before comparing.
 */
export function docsDeepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;

  // Handle Timestamp-like objects
  if (typeof a.toDate === "function" && typeof b.toDate === "function") {
    return a.toDate().getTime() === b.toDate().getTime();
  }

  if (typeof a !== "object" || typeof b !== "object") return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => docsDeepEqual(val, b[i]));
  }

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  if (keysA.some((k, i) => k !== keysB[i])) return false;

  return keysA.every((k) => docsDeepEqual(a[k], b[k]));
}

// ---------------------------------------------------------------------------
// Doc builders
// ---------------------------------------------------------------------------

/**
 * Build the writing_analysis doc for a backfilled week.
 * Shape mirrors production (handwriting.js:299-311) + backfill markers.
 *
 * @param {Object} parsed - Parsed VLM response (from parseWritingAnalysisResponse)
 * @param {Object} ctx - { mediaDocs, studentAge, model, programId, classroomId, weekKey }
 * @returns {Object} The doc to write to ai_summaries/writing_analysis
 */
export function buildBackfillAnalysisDoc(parsed, ctx) {
  return {
    ...parsed,
    sampleCount: ctx.mediaDocs.length,
    copiedCount: ctx.mediaDocs.filter((d) => d.copied === true).length,
    studentAge: ctx.studentAge,
    generatedAt: new Date(), // honest: actual write time
    sourceMediaIds: ctx.mediaDocs.map((d) => d.id),
    model: ctx.model,
    programId: ctx.programId || null,
    classroomId: ctx.classroomId || null,
    status: "completed",
    periodKey: ctx.weekKey, // historical week, not current
    backfilled: true, // compensatory backfill marker (#281)
  };
}

// ---------------------------------------------------------------------------
// State machine helpers
// ---------------------------------------------------------------------------

/**
 * Determine the next week to process, given current state.
 * @param {Object|null} stateDoc - { verifiedWeeks: string[] } or null
 * @returns {string|null} Next week key, or null if all done
 */
export function nextTargetWeek(stateDoc) {
  const verified = new Set(stateDoc?.verifiedWeeks || []);
  return TARGET_WEEKS.find((wk) => !verified.has(wk)) || null;
}

/**
 * Find students blocked from processing in targetWeek due to
 * unresolved failures in any earlier week.
 * @param {Object} weekOutcomes - { "2026-W30": { studentId: "completed"|"skipped:..."|"failed:..." } }
 * @param {string} targetWeek - The week about to be processed
 * @returns {Set<string>} Student IDs that must not be processed
 */
export function getBlockedStudents(weekOutcomes, targetWeek) {
  const blocked = new Set();
  if (!weekOutcomes) return blocked;

  for (const wk of TARGET_WEEKS) {
    if (wk >= targetWeek) break; // only check earlier weeks
    const outcomes = weekOutcomes[wk];
    if (!outcomes) continue;
    for (const [studentId, outcome] of Object.entries(outcomes)) {
      if (outcome.startsWith("failed:")) {
        blocked.add(studentId);
      }
    }
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Phase 1: lump cleanup planning
// ---------------------------------------------------------------------------

/**
 * Plan the lump cleanup for a single student.
 *
 * Two cases:
 * - Student had a prior analysis: the lump run archived it to history.
 *   Restore that archive to live, delete the history entry.
 * - Student had NO prior analysis (lump was their first): the lump run
 *   wrote a fresh doc with no archive. Delete the lump doc entirely -
 *   pre-lump state was "no writing_analysis doc."
 *
 * @param {Object} combinedDoc - The lump-processed live writing_analysis doc
 * @param {Array<{id:string, data:Object}>} historyEntries - All history entries for this student
 * @returns {{ mediaToUnstamp: string[], historyEntryToRestore: {id:string, data:Object}|null, deleteLiveDoc: boolean }}
 */
export function planLumpCleanup(combinedDoc, historyEntries) {
  if (!combinedDoc.sourceMediaIds?.length) {
    throw new Error("Combined doc has no sourceMediaIds - cannot determine media to un-stamp");
  }

  if (!historyEntries.length) {
    // First-ever analysis for this student - delete the lump doc, no restore
    return {
      mediaToUnstamp: [...combinedDoc.sourceMediaIds],
      historyEntryToRestore: null,
      deleteLiveDoc: true,
    };
  }

  // The most recent history entry is the one archived by the lump run
  // (it's the pre-lump live doc that was moved to history)
  const entryToRestore = historyEntries[historyEntries.length - 1];
  const restoredData = { ...entryToRestore.data };
  delete restoredData.archivedAt;

  return {
    mediaToUnstamp: [...combinedDoc.sourceMediaIds],
    historyEntryToRestore: {
      id: entryToRestore.id,
      data: restoredData,
    },
    deleteLiveDoc: false,
  };
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

/**
 * Pure verification of a week's outcomes against fetched Firestore state.
 * @param {string} weekKey
 * @param {Object} outcomes - { studentId: "completed"|"skipped:..."|"failed:..." }
 * @param {Object} fetchedState - Per-student state fetched after execution
 * @returns {{ pass: boolean, failures: Array<{studentId, reason}>, summary: {completed, skipped, failed} }}
 */
export function verifyWeekReport(weekKey, outcomes, fetchedState) {
  const failures = [];
  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [studentId, outcome] of Object.entries(outcomes)) {
    if (outcome === "completed") {
      completed++;
      const state = fetchedState[studentId];
      if (!state?.liveDoc) {
        failures.push({ studentId, reason: "completed but no live doc found" });
        continue;
      }
      if (state.liveDoc.periodKey !== weekKey) {
        failures.push({ studentId, reason: `periodKey mismatch: expected ${weekKey}, got ${state.liveDoc.periodKey}` });
      }
      if (!state.liveDoc.backfilled) {
        failures.push({ studentId, reason: "missing backfilled flag" });
      }
      if (!state.allMediaStamped) {
        failures.push({ studentId, reason: "not all source media stamped with batchAnalyzedAt" });
      }
      if (!state.archivePresent) {
        failures.push({ studentId, reason: "prior week archive not found in history" });
      }
    } else if (outcome.startsWith("skipped:")) {
      skipped++;
      const state = fetchedState[studentId];
      if (state && !state.generatedAtUnchanged) {
        failures.push({ studentId, reason: "skipped student doc was mutated (generatedAt changed)" });
      }
    } else if (outcome.startsWith("failed:")) {
      failed++;
      failures.push({ studentId, reason: `failed during execution: ${outcome}` });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    summary: { completed, skipped, failed },
  };
}

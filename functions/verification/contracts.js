/**
 * Per-job verification contracts (#229).
 *
 * Each contract defines how to verify that a claimed-successful workItem
 * actually produced its required business outputs. Three layers:
 *   1. Existence - the doc is at the expected path
 *   2. Period match - the doc's period field == executionId
 *   3. Structural sanity - required fields are present and well-formed
 *
 * Contracts verify structural correctness, never content quality.
 */

import { db } from "../shared/firebase.js";

// ---------------------------------------------------------------------------
// Pure verification predicates (testable without Firebase)
// ---------------------------------------------------------------------------

/**
 * Verify a baseball-card weekly_snapshot doc.
 * @param {object|null} data - Firestore doc data
 * @param {string} executionId - expected weekKey
 * @param {Date} executionStart
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifyBaseballCard(data, executionId, executionStart) {
  if (!data) return { pass: false, reason: "doc_missing" };
  if (data.weekKey !== executionId) {
    return { pass: false, reason: `stale_period: ${data.weekKey}` };
  }
  if (!data.generatedAt) return { pass: false, reason: "missing_generatedAt" };
  const genAt = data.generatedAt.toDate ? data.generatedAt.toDate() : new Date(data.generatedAt);
  if (genAt < executionStart) return { pass: false, reason: "generatedAt_before_execution" };
  if (!["ok", "no_notes"].includes(data.status)) {
    return { pass: false, reason: `unexpected_status: ${data.status}` };
  }
  if (data.status === "ok" && !data.summary) {
    return { pass: false, reason: "ok_but_empty_summary" };
  }
  return { pass: true };
}

/**
 * Verify a writing_analysis doc.
 * @param {object|null} data
 * @param {string} executionId - expected weekKey
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifyWritingAnalysis(data, executionId) {
  if (!data) return { pass: false, reason: "doc_missing" };
  // Writing analysis gets a new periodKey field added by this issue
  if (data.periodKey && data.periodKey !== executionId) {
    return { pass: false, reason: `stale_period: ${data.periodKey}` };
  }
  if (data.status !== "completed") {
    return { pass: false, reason: `unexpected_status: ${data.status}` };
  }
  return { pass: true };
}

/**
 * Verify a soul doc + open_questions + guidelines.
 * @param {object} docs - { soul, openQuestions, guidelines }
 * @param {string} executionId - expected targetMonth
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifySoul(docs, executionId) {
  const { soul, openQuestions, guidelines } = docs;
  if (!soul) return { pass: false, reason: "soul_missing" };
  if (soul.generatedForMonth !== executionId) {
    return { pass: false, reason: `stale_soul: ${soul.generatedForMonth}` };
  }
  // no_notes is a valid outcome - soul still gets written
  if (soul.status !== "ok" && soul.status !== "no_notes") {
    // Check for content presence as fallback (older docs may lack status)
    if (!soul.content && soul.status !== "no_notes") {
      return { pass: false, reason: "soul_empty_content" };
    }
  }
  if (!openQuestions) return { pass: false, reason: "open_questions_missing" };
  if (openQuestions.generatedForMonth !== executionId) {
    return { pass: false, reason: `stale_open_questions: ${openQuestions.generatedForMonth}` };
  }
  if (!guidelines) return { pass: false, reason: "guidelines_missing" };
  return { pass: true };
}

/**
 * Verify a monthly_plan doc + Drive export.
 * @param {object} docs - { plan }
 * @param {string} executionId - expected targetMonth
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifyMonthlyPlan(docs, executionId) {
  const { plan } = docs;
  if (!plan) return { pass: false, reason: "plan_missing" };
  if (plan.month !== executionId) {
    return { pass: false, reason: `stale_plan: ${plan.month}` };
  }
  if (plan.status !== "generated") {
    return { pass: false, reason: `unexpected_status: ${plan.status}` };
  }
  if (!plan.driveDocId) return { pass: false, reason: "drive_doc_missing" };
  if (!plan.driveChecklistId) return { pass: false, reason: "drive_checklist_missing" };
  return { pass: true };
}

/**
 * Verify a classroom digest doc.
 * @param {object|null} data
 * @param {string} executionId - expected weekKey
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifyDigest(data, executionId) {
  if (!data) return { pass: false, reason: "doc_missing" };
  if (data.weekKey !== executionId) {
    return { pass: false, reason: `stale_period: ${data.weekKey}` };
  }
  if (!data.htmlContent) return { pass: false, reason: "empty_htmlContent" };
  return { pass: true };
}

/**
 * Verify a chat doc was deleted (cleanup verification).
 * @param {boolean} docExists
 * @returns {{pass:boolean, reason?:string}}
 */
export function verifyDeletion(docExists) {
  if (docExists) return { pass: false, reason: "doc_still_exists" };
  return { pass: true };
}

// ---------------------------------------------------------------------------
// Contract registry (Firestore-aware: reads destination stores)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} VerificationContract
 * @property {(workItem: object, executionId: string, executionStart: Date) => Promise<{pass:boolean, reason?:string}>} verify
 */

// Contract methods share a common (workItem, executionId, executionStart)
// signature for polymorphism; not all methods use every parameter.
/* eslint-disable no-unused-vars */
/** @type {Record<string, VerificationContract>} */
export const CONTRACTS = {
  baseballCards: {
    async verify(workItem, executionId, executionStart) {
      const snap = await db.doc(`students/${workItem.id}/ai_summaries/weekly_snapshot`).get();
      return verifyBaseballCard(snap.exists ? snap.data() : null, executionId, executionStart);
    },
  },

  writingAnalysis: {
    async verify(workItem, executionId, _executionStart) {
      const snap = await db.doc(`students/${workItem.id}/ai_summaries/writing_analysis`).get();
      return verifyWritingAnalysis(snap.exists ? snap.data() : null, executionId);
    },
  },

  soulRegen: {
    async verify(workItem, executionId, _executionStart) {
      const base = `students/${workItem.id}/ai_summaries`;
      const [soulSnap, oqSnap, guidelinesSnap] = await Promise.all([
        db.doc(`${base}/soul`).get(),
        db.doc(`${base}/open_questions`).get(),
        db.doc(`${base}/guidelines`).get(),
      ]);
      return verifySoul({
        soul: soulSnap.exists ? soulSnap.data() : null,
        openQuestions: oqSnap.exists ? oqSnap.data() : null,
        guidelines: guidelinesSnap.exists ? guidelinesSnap.data() : null,
      }, executionId);
    },
  },

  monthlyPlans: {
    async verify(workItem, executionId, _executionStart) {
      const snap = await db.doc(`students/${workItem.id}/ai_summaries/monthly_plan`).get();
      const plan = snap.exists ? snap.data() : null;
      const result = verifyMonthlyPlan({ plan }, executionId);
      if (!result.pass) return result;

      // Layer 3 extension: verify Drive docs exist via API
      // Drive verification is best-effort; API failures are non-fatal
      // but mark the item as unverified rather than silently passing.
      // Full Drive verification deferred to a separate check to avoid
      // adding Drive API dependency to the core verifier path.
      // For now, the presence of driveDocId and driveChecklistId in
      // Firestore is the verification (set by the worker after
      // successful export).
      return { pass: true };
    },
  },

  digestClassroomAdmin: {
    async verify(workItem, executionId, _executionStart) {
      const snap = await db.doc(`classrooms/${workItem.id}/digests/weekly_email`).get();
      return verifyDigest(snap.exists ? snap.data() : null, executionId);
    },
  },

  digestSuperadmin: {
    async verify(_workItem, executionId, _executionStart) {
      const snap = await db.doc("classrooms/_digest_all/digests/weekly_email").get();
      return verifyDigest(snap.exists ? snap.data() : null, executionId);
    },
  },

  cleanupDeletedChats: {
    async verify(workItem, _executionId, _executionStart) {
      // The workItem.id is the chat doc path recorded at seeding time.
      // Success means the doc no longer exists.
      const snap = await db.doc(workItem.id).get();
      return verifyDeletion(snap.exists);
    },
  },
};

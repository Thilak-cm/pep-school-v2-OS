/**
 * Weekly Drive integrity check (Kokapet folder-deletion incident follow-up).
 *
 * Principle: probe every CACHED Drive ID pointer the system stores. Cached
 * IDs are dangling-pointer risks - anyone with Drive access can delete the
 * target and the pointer rots silently (Himalayas/Nilgiris folders were dead
 * for 2+ months before the Sept 2026 month-end export cascade surfaced it).
 * Name-resolved artifacts (subfolders, CSVs) self-heal on write and are
 * deliberately NOT probed.
 *
 * Probe inventory:
 *   1. Shared drive root (catastrophic canary)
 *   2. classrooms/{id}.driveFolderId
 *   3. Current-month monthly_plan driveDocId + driveChecklistId per student
 *   4. Current-academic-year report driveDocId per student
 *
 * Read-only by design: the verifier alerts but never heals, preserving the
 * human's option to untrash the original folder (30-day window) instead of
 * letting export-time self-healing recreate it empty. Detection <= 7 days
 * after deletion keeps that window open.
 *
 * Weekly green heartbeat is intentional - silence-as-health would itself be
 * a dangling pointer if this check ever stopped running.
 */

import { DRIVE_CONSTANTS, AY_START_MONTH } from "../config/reportConstants.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Escape HTML for Telegram HTML parse mode (local copy of verifierTelegram's). */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Current IST month as "YYYY-MM". */
export function currentMonthIST(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Start of the current academic year (June 1) as a Date. */
export function academicYearStart(now = new Date()) {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= AY_START_MONTH ? year : year - 1;
  return new Date(Date.UTC(startYear, AY_START_MONTH, 1));
}

/**
 * Classify a successful files.get response.
 * @param {{trashed?: boolean, driveId?: string}} data
 * @param {string} sharedDriveId
 * @returns {"ok"|"dead"|"moved_out"}
 */
export function classifyProbeData(data, sharedDriveId) {
  if (data?.trashed) return "dead";
  if (data?.driveId && data.driveId !== sharedDriveId) return "moved_out";
  return "ok";
}

/**
 * Classify a files.get error by HTTP status.
 * 404 proves the target is gone; 403 means it exists but the service
 * account lost access (remedy: re-share, NOT recreate); anything else is
 * transient and must never be reported as a deletion.
 * @param {number|undefined} status
 * @returns {"dead"|"access_lost"|"unverifiable"}
 */
export function classifyProbeError(status) {
  if (status === 404) return "dead";
  if (status === 403) return "access_lost";
  return "unverifiable";
}

/**
 * Build the probe list from Firestore-derived inputs. Pure.
 * New probe kinds are data, not code paths - extend here (e.g. CSVs)
 * without touching the runner.
 * @returns {Array<{kind: string, fileId: string, label: string, remediation: string}>}
 */
export function buildProbeList({ classrooms = [], planDocs = [], reportDocs = [], sharedDriveId }) {
  const probes = [{
    kind: "shared_drive_root",
    fileId: sharedDriveId,
    label: "Shared drive root",
    remediation: "check service-account membership on the shared drive",
  }];
  for (const c of classrooms) {
    if (!c.driveFolderId) continue; // null = lazily created on first export; legitimate
    probes.push({
      kind: "classroom_folder",
      fileId: c.driveFolderId,
      label: c.name || c.id,
      remediation: "untrash within 30d or next export recreates it empty",
    });
  }
  for (const p of planDocs) {
    if (p.driveDocId) {
      probes.push({ kind: "plan_doc", fileId: p.driveDocId, label: `${p.studentId} (${p.month})`, remediation: "re-export student plan" });
    }
    if (p.driveChecklistId) {
      probes.push({ kind: "plan_checklist", fileId: p.driveChecklistId, label: `${p.studentId} (${p.month})`, remediation: "re-export student plan" });
    }
  }
  for (const r of reportDocs) {
    if (!r.driveDocId) continue;
    probes.push({ kind: "report_doc", fileId: r.driveDocId, label: `${r.studentId} ${r.reportType || "term"}`, remediation: "re-export report" });
  }
  return probes;
}

const PROBLEM_VERDICTS = ["dead", "access_lost"];
const WARNING_VERDICTS = ["moved_out", "unverifiable"];
const MAX_LISTED_PROBLEMS = 12;

const VERDICT_LABELS = {
  dead: "DEAD",
  access_lost: "ACCESS LOST",
  moved_out: "MOVED OUT OF SHARED DRIVE",
  unverifiable: "UNVERIFIABLE",
};

/**
 * Format the Telegram signal from probe results. Pure.
 * @param {Array<{kind: string, label: string, remediation: string, verdict: string}>} results
 * @returns {{ok: boolean, message: string}}
 */
export function formatDriveIntegritySignal(results) {
  const problems = results.filter((r) => PROBLEM_VERDICTS.includes(r.verdict));
  const warnings = results.filter((r) => WARNING_VERDICTS.includes(r.verdict));
  const okCount = results.length - problems.length - warnings.length;

  const kindCounts = {};
  for (const r of results) kindCounts[r.kind] = (kindCounts[r.kind] || 0) + 1;
  const breakdown = Object.entries(kindCounts).map(([k, n]) => `${n} ${k}`).join(", ");

  if (!problems.length && !warnings.length) {
    return {
      ok: true,
      message: [
        `<b>Drive Integrity OK</b>`,
        `${okCount}/${results.length} probes OK (${escapeHtml(breakdown)})`,
      ].join("\n"),
    };
  }

  const listed = [...problems, ...warnings].slice(0, MAX_LISTED_PROBLEMS);
  const lines = listed.map((r) =>
    `${VERDICT_LABELS[r.verdict]} ${escapeHtml(r.kind)}: ${escapeHtml(r.label)} - ${escapeHtml(r.remediation)}`,
  );
  const overflow = problems.length + warnings.length - listed.length;

  return {
    ok: problems.length === 0,
    message: [
      `<b>Drive Integrity ${problems.length ? "Problems" : "Warnings"}</b>`,
      ...lines,
      ...(overflow > 0 ? [`…and ${overflow} more`] : []),
      `${okCount}/${results.length} probes OK (${escapeHtml(breakdown)})`,
    ].join("\n"),
  };
}

/** Probe one file with a single retry on transient errors. */
async function probeFile(drive, fileId, sharedDriveId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const meta = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: "id, trashed, driveId",
      });
      return classifyProbeData(meta.data, sharedDriveId);
    } catch (err) {
      const status = err?.code ?? err?.response?.status;
      const verdict = classifyProbeError(status);
      if (verdict !== "unverifiable" || attempt === 1) return verdict;
      // transient (429/5xx/network): retry once before reporting unverifiable
    }
  }
  return "unverifiable";
}

/**
 * Gather pointers, probe Drive, and format the signal.
 * @param {object} db - Firestore instance
 * @param {object} drive - Drive API client
 * @returns {Promise<{ok: boolean, message: string, results: Array}>}
 */
export async function runDriveIntegrityCheck(db, drive, { now = new Date() } = {}) {
  const sharedDriveId = DRIVE_CONSTANTS.sharedDriveId;
  const targetMonth = currentMonthIST(now);
  const ayStart = academicYearStart(now);

  // Gather cached pointers from Firestore
  const classroomsSnap = await db.collection("classrooms").get();
  const classrooms = classroomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const studentIds = await fetchActiveStudentIds();
  const planDocs = [];
  const reportDocs = [];
  await runWithConcurrency(studentIds, async (studentId) => {
    const [planSnap, reportsSnap] = await Promise.all([
      db.doc(`students/${studentId}/ai_summaries/monthly_plan`).get(),
      // kind == "report" uses the automatic single-field index; the AY window
      // is filtered in memory (a student has only a handful of reports).
      db.collection(`students/${studentId}/ai_summaries`).where("kind", "==", "report").get(),
    ]);
    if (planSnap.exists && planSnap.data().month === targetMonth) {
      const d = planSnap.data();
      planDocs.push({ studentId, month: d.month, driveDocId: d.driveDocId, driveChecklistId: d.driveChecklistId });
    }
    for (const doc of reportsSnap.docs) {
      const d = doc.data();
      const genAt = d.generatedAt?.toDate ? d.generatedAt.toDate() : (d.generatedAt ? new Date(d.generatedAt) : null);
      if (!genAt || genAt < ayStart || !d.driveDocId) continue;
      reportDocs.push({ studentId, reportType: d.reportType, driveDocId: d.driveDocId });
    }
  }, 20);

  const probes = buildProbeList({ classrooms, planDocs, reportDocs, sharedDriveId });

  const results = [];
  await runWithConcurrency(probes, async (probe) => {
    const verdict = await probeFile(drive, probe.fileId, sharedDriveId);
    results.push({ ...probe, verdict });
  }, 10);

  const { ok, message } = formatDriveIntegritySignal(results);
  const problemCount = results.filter((r) => r.verdict !== "ok").length;
  const logFn = ok ? console.log : console.error;
  logFn(`[driveIntegrity] ${results.length} probes, ${problemCount} problems/warnings`);
  return { ok, message, results };
}

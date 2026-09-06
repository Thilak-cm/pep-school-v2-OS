/**
 * Weekly teacher stats email (#274).
 *
 * One shared core (sendTeacherStats) with two thin trigger wrappers, so the
 * scheduled path and the test callable can never drift apart — the anti-pattern
 * triggerDigestTest fell into (see #278 for that refactor).
 *
 * - weeklyTeacherStats: Monday 12:00 IST, reads the statsCache written by
 *   Saturday's reconcile (moved in this issue), emails every active teacher
 *   their weekly numbers and every classroomadmin a combined roster view.
 * - triggerTeacherStatsTest: superadmin-only callable that renders both email
 *   variants for chosen subjects and sends them to an override inbox.
 *
 * No LLM calls — pure data → HTML → Resend, so no Langfuse tracing here.
 */

import * as functions from "firebase-functions/v1";
import {defineSecret} from "firebase-functions/params";
import {db, FieldPath} from "../shared/firebase.js";
import {SENDGRID_API_KEY, sendEmail} from "../shared/sendgrid.js";
import {runWithConcurrency} from "../shared/scheduling.js";
import {
  buildWorkItemUpdate,
  classifyError,
  computeExecutionId,
  createExecution,
  markExecutionFailed,
  seedWorkItems,
  updateWorkItem,
} from "../shared/ledger.js";
import {broadcastAlert} from "../shared/telegram.js";
import {formatCrashSignal} from "../shared/verifierTelegram.js";
import {
  buildDailySeries,
  buildTeacherSections,
  formatWeekLabel,
  previousWeekStartDay,
  renderAdminEmail,
  renderTeacherEmail,
  resolveRecipients,
} from "./renderTeacherStats.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const REGION = "asia-south1";
const JOB_KEY = "teacherStats";
const EMAIL_CONCURRENCY = 5;

// Default test subjects (from #274): Hemapriya TS (Periwinkle, high volume)
// for the teacher view; Yamini (4 classrooms, also on rosters) for admin view.
const DEFAULT_TEST_TEACHER_UID = "4H2oo6S3sAR4K5ac1mrGCljdGit1";
const DEFAULT_TEST_ADMIN_UID = "EgZZGIxevqdSaBUZRXZ0st0Ax2c2";

async function loadContext(database) {
  const [cachesSnap, usersSnap] = await Promise.all([
    database.collection("statsCache")
      .orderBy(FieldPath.documentId())
      .startAt("classroom_")
      .endAt("classroom_\uf8ff")
      .get(),
    database.collection("users").get(),
  ]);
  const caches = cachesSnap.docs.map((doc) => doc.data());
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, {id: doc.id, ...doc.data()}]));
  return {caches, users};
}

function buildTeacherMessage(recipient, caches, weekStartDay) {
  const weekLabel = formatWeekLabel(weekStartDay);
  return {
    subject: `Your weekly stats - ${weekLabel}`,
    html: renderTeacherEmail({
      teacherName: recipient.name,
      weekLabel,
      series: buildDailySeries(caches, recipient.id, weekStartDay),
      sections: buildTeacherSections(caches, recipient.id),
    }),
  };
}

function buildAdminMessage(recipient, caches, weekStartDay) {
  const weekLabel = formatWeekLabel(weekStartDay);
  // Own-activity box covers every classroom whose roster includes the admin
  // (not just manageable ones) — it is their personal teaching record.
  const selfSections = buildTeacherSections(caches, recipient.id);
  const self = selfSections.length
    ? {series: buildDailySeries(caches, recipient.id, weekStartDay), sections: selfSections}
    : null;
  const classrooms = caches
    .filter((cache) => (recipient.classroomIds || []).includes(cache.classroomId))
    .map((cache) => ({
      classroomName: cache.classroomName || cache.classroomId,
      studentCount: cache.studentCount || 0,
      teachers: (cache.teachers || [])
        .filter((row) => (row.status || "active") === "active" && !row.id.startsWith("pending_"))
        .map((row) => ({name: row.name, isSelf: row.id === recipient.id, row})),
    }));
  return {
    subject: `Weekly teacher stats - ${weekLabel}`,
    html: renderAdminEmail({adminName: recipient.name, weekLabel, self, classrooms}),
  };
}

const toRecipient = (user) => ({
  id: user.id,
  email: user.email || "",
  name: user.displayName || user.email || user.id,
  classroomIds: user.manageableClassrooms || [],
});

/**
 * Shared core for both triggers.
 *
 * @param {Object} opts
 * @param {string[]} [opts.teacherUids] - Explicit teacher subjects (test path);
 *   omit to email every resolved teacher recipient.
 * @param {string[]} [opts.adminUids] - Explicit admin subjects (test path).
 * @param {string} [opts.overrideEmail] - Route every email here instead of the
 *   recipient's own inbox (test path only).
 * @param {Object} [opts.ledger] - {executionId} to record per-recipient work
 *   items (scheduled path only).
 */
export async function sendTeacherStats({teacherUids = null, adminUids = null, overrideEmail = null, ledger = null, database = db, now = new Date()} = {}) {
  const {caches, users} = await loadContext(database);
  const resolved = resolveRecipients(caches, users);
  const teachers = teacherUids
    ? teacherUids.map((uid) => toRecipient(users.get(uid) || {id: uid}))
    : resolved.teachers;
  const admins = adminUids
    ? adminUids.map((uid) => toRecipient(users.get(uid) || {id: uid}))
    : resolved.admins;
  const weekStartDay = previousWeekStartDay(now.getTime());

  const jobs = [
    ...teachers.map((recipient) => ({recipient, kind: "teacher"})),
    ...admins.map((recipient) => ({recipient, kind: "admin"})),
  ];
  if (ledger) {
    await createExecution(JOB_KEY, ledger.executionId, jobs.length);
    await seedWorkItems(JOB_KEY, ledger.executionId, jobs.map((job) => job.recipient.id));
  }

  const results = {sent: 0, failed: 0, failures: []};
  await runWithConcurrency(jobs, async ({recipient, kind}) => {
    try {
      const to = overrideEmail || recipient.email;
      if (!to) throw new Error(`No email for recipient ${recipient.id}`);
      const message = kind === "teacher"
        ? buildTeacherMessage(recipient, caches, weekStartDay)
        : buildAdminMessage(recipient, caches, weekStartDay);
      await sendEmail({to, subject: message.subject, html: message.html});
      results.sent++;
      if (ledger) await updateWorkItem(JOB_KEY, ledger.executionId, recipient.id, buildWorkItemUpdate("success", {}));
    } catch (err) {
      results.failed++;
      results.failures.push({id: recipient.id, kind, message: err.message});
      console.error(JSON.stringify({event: "teacher_stats_email_failed", recipientId: recipient.id, kind, message: err.message}));
      if (ledger) {
        await updateWorkItem(JOB_KEY, ledger.executionId, recipient.id, buildWorkItemUpdate("failed", {
          failureCategory: classifyError(err),
          errorMessage: err.message,
        })).catch((ledgerErr) => console.error(JSON.stringify({event: "teacher_stats_ledger_write_failed", recipientId: recipient.id, message: ledgerErr.message})));
      }
    }
  }, EMAIL_CONCURRENCY);
  return results;
}

// ── Scheduled trigger: Monday 12:00 IST ─────────────────────────────

export const weeklyTeacherStats = functions.region(REGION)
  .runWith({timeoutSeconds: 540, memory: "512MB", secrets: [SENDGRID_API_KEY, TELEGRAM_BOT_TOKEN]})
  // Monday noon IST: after Saturday's reconcile snapshot, before the school
  // day's capture activity would make "last week" feel stale. ~81 emails, well
  // under the Resend free-tier 100/day cap alongside Sunday's ~12 digests.
  .pubsub.schedule("0 12 * * 1")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const executionId = computeExecutionId(JOB_KEY);
    try {
      const results = await sendTeacherStats({ledger: {executionId}});
      console.log(JSON.stringify({event: "teacher_stats_sent", executionId, sent: results.sent, failed: results.failed}));
    } catch (err) {
      console.error(JSON.stringify({event: "teacher_stats_fatal", executionId, message: err.message, code: err.code || "unknown"}));
      await markExecutionFailed(JOB_KEY, executionId, err).catch(() => {});
      const msg = formatCrashSignal(JOB_KEY, executionId, classifyError(err), err.message);
      await broadcastAlert(TELEGRAM_BOT_TOKEN.value(), db, msg).catch(() => {});
    }
    return null;
  });

// ── Test trigger (callable, superadmin only) ────────────────────────

export const triggerTeacherStatsTest = functions.region(REGION)
  .runWith({timeoutSeconds: 300, memory: "512MB", secrets: [SENDGRID_API_KEY]})
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Superadmin only");
    }
    const overrideEmail = data?.overrideEmail || callerSnap.data().email;
    if (!overrideEmail) {
      throw new functions.https.HttpsError("failed-precondition", "No override email and caller has no email");
    }
    const results = await sendTeacherStats({
      teacherUids: [data?.teacherUid || DEFAULT_TEST_TEACHER_UID],
      adminUids: [data?.adminUid || DEFAULT_TEST_ADMIN_UID],
      overrideEmail,
    });
    return {...results, overrideEmail};
  });

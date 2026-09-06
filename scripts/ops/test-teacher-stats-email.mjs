#!/usr/bin/env node
/**
 * Local test runner for weekly teacher stats email (#274).
 *
 * Calls the shared sendTeacherStats() core directly against production
 * Firestore with firebase-admin (bypasses callable auth wrapper). Requires
 * RESEND_API_KEY in environment.
 *
 * Usage:
 *   RESEND_API_KEY=$(firebase functions:secrets:access RESEND_API_KEY) \
 *     node scripts/ops/test-teacher-stats-email.mjs --to thilak@pepschoolv2.com
 *
 * Flags:
 *   --to <email>           Override email (required)
 *   --teacher <uid>        Teacher subject (default: Hemapriya)
 *   --admin <uid>          Admin subject (default: Yamini)
 *   --dry-run              Render to /tmp HTML files instead of sending
 */

import {initializeApp, cert, getApps} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {writeFileSync} from "node:fs";
import {parseArgs} from "node:util";

if (!getApps().length) initializeApp({projectId: "pep-os"});
const db = getFirestore();

const {values: flags} = parseArgs({
  options: {
    to: {type: "string"},
    teacher: {type: "string", default: "4H2oo6S3sAR4K5ac1mrGCljdGit1"},
    admin: {type: "string", default: "EgZZGIxevqdSaBUZRXZ0st0Ax2c2"},
    "dry-run": {type: "boolean", default: false},
  },
  strict: false,
});

if (!flags.to && !flags["dry-run"]) {
  console.error("Error: --to <email> is required (or use --dry-run)");
  process.exit(1);
}

// Import the core function and renderer from functions/
const {sendTeacherStats} = await import("../../functions/digest/teacherStats.js");
const {
  buildDailySeries,
  buildTeacherSections,
  previousWeekStartDay,
  renderAdminEmail,
  renderTeacherEmail,
  resolveRecipients,
} = await import("../../functions/digest/renderTeacherStats.js");

if (flags["dry-run"]) {
  // Render to files using real Firestore data, no email sending.
  const {FieldPath} = await import("firebase-admin/firestore");
  const [cachesSnap, usersSnap] = await Promise.all([
    db.collection("statsCache").orderBy(FieldPath.documentId()).startAt("classroom_").endAt("classroom_\uf8ff").get(),
    db.collection("users").get(),
  ]);
  const caches = cachesSnap.docs.map((doc) => doc.data());
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, {id: doc.id, ...doc.data()}]));
  const weekStart = previousWeekStartDay(Date.now());

  // Teacher preview
  const teacherUser = users.get(flags.teacher);
  const teacherSections = buildTeacherSections(caches, flags.teacher);
  const teacherSeries = buildDailySeries(caches, flags.teacher, weekStart);
  const DAY_MS = 86400000;
  const startDate = new Date(weekStart * DAY_MS);
  const endDate = new Date((weekStart + 6) * DAY_MS);
  const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
  const month = (dt) => dt.toLocaleString("en-US", {month: "short", timeZone: "UTC"});
  const yearTag = `W${week} of ${endDate.getUTCFullYear()}`;
  const weekLabel = startDate.getUTCMonth() === endDate.getUTCMonth()
    ? `${month(startDate)} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${yearTag}`
    : `${month(startDate)} ${startDate.getUTCDate()} - ${month(endDate)} ${endDate.getUTCDate()}, ${yearTag}`;

  const teacherHtml = renderTeacherEmail({
    teacherName: teacherUser?.displayName || flags.teacher,
    weekLabel,
    series: teacherSeries,
    sections: teacherSections,
  });
  writeFileSync("/tmp/274-teacher-preview.html", teacherHtml);
  console.log(`Teacher preview: /tmp/274-teacher-preview.html (${teacherSections.length} classrooms)`);

  // Admin preview
  const adminUser = users.get(flags.admin);
  const {teachers: resolvedTeachers, admins: resolvedAdmins} = resolveRecipients(caches, users);
  const adminSelfSections = buildTeacherSections(caches, flags.admin);
  const adminSeries = buildDailySeries(caches, flags.admin, weekStart);
  const self = adminSelfSections.length
    ? {series: adminSeries, sections: adminSelfSections}
    : null;
  const classroomIds = adminUser?.manageableClassrooms || [];
  const classrooms = caches
    .filter((c) => classroomIds.includes(c.classroomId))
    .map((cache) => ({
      classroomName: cache.classroomName || cache.classroomId,
      studentCount: cache.studentCount || 0,
      teachers: (cache.teachers || [])
        .filter((row) => (row.status || "active") === "active" && !row.id.startsWith("pending_"))
        .map((row) => ({name: row.name, isSelf: row.id === flags.admin, row})),
    }));
  const adminHtml = renderAdminEmail({
    adminName: adminUser?.displayName || flags.admin,
    weekLabel,
    self,
    classrooms,
  });
  writeFileSync("/tmp/274-admin-preview.html", adminHtml);
  console.log(`Admin preview: /tmp/274-admin-preview.html (${classrooms.length} classrooms, self: ${!!self})`);
  console.log(`Recipients if live: ${resolvedTeachers.length} teachers, ${resolvedAdmins.length} admins`);
  process.exit(0);
}

// Live send mode — loads data with firebase-admin's FieldPath (avoids SDK
// mismatch with the functions-SDK FieldPath used inside sendTeacherStats).
const {sendEmail} = await import("../../functions/shared/sendgrid.js");
const {FieldPath} = await import("firebase-admin/firestore");

const [cachesSnap, usersSnap] = await Promise.all([
  db.collection("statsCache").orderBy(FieldPath.documentId()).startAt("classroom_").endAt("classroom_\uf8ff").get(),
  db.collection("users").get(),
]);
const caches = cachesSnap.docs.map((doc) => doc.data());
const users = new Map(usersSnap.docs.map((doc) => [doc.id, {id: doc.id, ...doc.data()}]));
const weekStart = previousWeekStartDay(Date.now());
const DAY_MS = 86400000;
const startDate = new Date(weekStart * DAY_MS);
const endDate = new Date((weekStart + 6) * DAY_MS);
const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
const week = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
const month = (dt) => dt.toLocaleString("en-US", {month: "short", timeZone: "UTC"});
const yearTag = `W${week} of ${endDate.getUTCFullYear()}`;
const weekLabel = startDate.getUTCMonth() === endDate.getUTCMonth()
  ? `${month(startDate)} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${yearTag}`
  : `${month(startDate)} ${startDate.getUTCDate()} - ${month(endDate)} ${endDate.getUTCDate()}, ${yearTag}`;

const toRecipient = (uid) => {
  const u = users.get(uid) || {};
  return {id: uid, email: u.email || "", name: u.displayName || u.email || uid, classroomIds: u.manageableClassrooms || []};
};

const jobs = [
  {recipient: toRecipient(flags.teacher), kind: "teacher"},
  {recipient: toRecipient(flags.admin), kind: "admin"},
];

let sent = 0;
let failed = 0;
for (const {recipient, kind} of jobs) {
  try {
    let subject, html;
    if (kind === "teacher") {
      const series = buildDailySeries(caches, recipient.id, weekStart);
      const sections = buildTeacherSections(caches, recipient.id);
      subject = `Your weekly stats - ${weekLabel}`;
      html = renderTeacherEmail({teacherName: recipient.name, weekLabel, series, sections});
    } else {
      const selfSections = buildTeacherSections(caches, recipient.id);
      const self = selfSections.length
        ? {series: buildDailySeries(caches, recipient.id, weekStart), sections: selfSections}
        : null;
      const classrooms = caches
        .filter((c) => (recipient.classroomIds || []).includes(c.classroomId))
        .map((cache) => ({
          classroomName: cache.classroomName || cache.classroomId,
          studentCount: cache.studentCount || 0,
          teachers: (cache.teachers || [])
            .filter((row) => (row.status || "active") === "active" && !row.id.startsWith("pending_"))
            .map((row) => ({name: row.name, isSelf: row.id === recipient.id, row})),
        }));
      subject = `Weekly teacher stats - ${weekLabel}`;
      html = renderAdminEmail({adminName: recipient.name, weekLabel, self, classrooms});
    }
    console.log(`Sending ${kind} email to ${flags.to} (subject: ${recipient.name})...`);
    await sendEmail({to: flags.to, subject, html});
    sent++;
  } catch (err) {
    failed++;
    console.error(`Failed ${kind} (${recipient.id}): ${err.message}`);
  }
}
console.log(`Done: ${sent} sent, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

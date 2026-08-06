/**
 * Read-only Coach Pepper usage report.
 *
 * This intentionally does not modify Firestore. It counts chat sessions from
 * chat metadata and reports how many were started by each teacher, while also
 * showing whether the rebuild can preserve existing transcript/turn data.
 *
 * Usage:
 *   node scripts/ops/analyze-chat-usage.mjs
 *   node scripts/ops/analyze-chat-usage.mjs --include-deleted
 *   node scripts/ops/analyze-chat-usage.mjs --json
 */

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

function parseArgs(argv) {
  return {
    includeDeleted: argv.includes("--include-deleted"),
    json: argv.includes("--json"),
  };
}

function timestampValue(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  return value ? new Date(value).toISOString() : null;
}

async function loadUsage({ includeDeleted }) {
  const chatsSnapshot = await db.collectionGroup("chats").get();
  const chats = [];

  for (const doc of chatsSnapshot.docs) {
    const data = doc.data() || {};
    if (!includeDeleted && data.deleted === true) continue;

    const studentRef = doc.ref.parent.parent;
    const studentId = studentRef?.id || null;
    const messagesSnapshot = await doc.ref.collection("messages").get();
    const turnsSnapshot = await doc.ref.collection("turns").get();
    const messageDocs = messagesSnapshot.docs.map((message) => message.data() || {});
    const teacherMessages = messageDocs.filter((message) => message.role === "user");
    const timestamps = [
      data.createdAt,
      data.updatedAt,
      ...messageDocs.map((message) => message.createdAt || message.timestamp),
    ].map(timestampValue).filter(Boolean);

    chats.push({
      chatId: doc.id,
      studentId,
      classroomId: data.classroomId || null,
      createdBy: data.createdBy || null,
      deleted: data.deleted === true,
      messageCount: messageDocs.length,
      teacherMessageCount: teacherMessages.length,
      turnCount: turnsSnapshot.size,
      firstActivity: timestamps.length ? Math.min(...timestamps) : 0,
      lastActivity: timestamps.length ? Math.max(...timestamps) : 0,
      legacyTimestampMessages: messageDocs.filter((message) => !message.createdAt && message.timestamp).length,
    });
  }

  const byTeacher = new Map();
  for (const chat of chats) {
    const key = chat.createdBy || "unknown-owner";
    const current = byTeacher.get(key) || { sessions: 0, teacherMessages: 0, students: new Set() };
    current.sessions++;
    current.teacherMessages += chat.teacherMessageCount;
    if (chat.studentId) current.students.add(chat.studentId);
    byTeacher.set(key, current);
  }

  const allTimestamps = chats.flatMap((chat) => [chat.firstActivity, chat.lastActivity]).filter(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    includeDeleted,
    totals: {
      sessions: chats.length,
      sessionsStartedByKnownTeachers: chats.filter((chat) => chat.createdBy).length,
      sessionsWithUnknownOwner: chats.filter((chat) => !chat.createdBy).length,
      deletedSessionsIncluded: chats.filter((chat) => chat.deleted).length,
      students: new Set(chats.map((chat) => chat.studentId).filter(Boolean)).size,
      classrooms: new Set(chats.map((chat) => chat.classroomId).filter(Boolean)).size,
      messages: chats.reduce((total, chat) => total + chat.messageCount, 0),
      teacherMessages: chats.reduce((total, chat) => total + chat.teacherMessageCount, 0),
      turns: chats.reduce((total, chat) => total + chat.turnCount, 0),
      legacyTimestampMessages: chats.reduce((total, chat) => total + chat.legacyTimestampMessages, 0),
      firstActivity: allTimestamps.length ? formatDate(Math.min(...allTimestamps)) : null,
      lastActivity: allTimestamps.length ? formatDate(Math.max(...allTimestamps)) : null,
    },
    teachers: [...byTeacher.entries()]
      .map(([teacherId, value]) => ({
        teacherId,
        sessions: value.sessions,
        teacherMessages: value.teacherMessages,
        students: value.students.size,
      }))
      .sort((a, b) => b.sessions - a.sessions || a.teacherId.localeCompare(b.teacherId)),
    chats,
  };
}

function printReport(report) {
  console.log("Coach Pepper usage");
  console.log(`Sessions: ${report.totals.sessions}`);
  console.log(`Started by known teachers: ${report.totals.sessionsStartedByKnownTeachers}`);
  console.log(`Unknown-owner sessions: ${report.totals.sessionsWithUnknownOwner}`);
  console.log(`Students: ${report.totals.students}`);
  console.log(`Classrooms: ${report.totals.classrooms}`);
  console.log(`Messages: ${report.totals.messages} (${report.totals.teacherMessages} teacher messages)`);
  console.log(`Turns: ${report.totals.turns}`);
  console.log(`Legacy timestamp-only messages: ${report.totals.legacyTimestampMessages}`);
  console.log(`Activity: ${report.totals.firstActivity || "none"} → ${report.totals.lastActivity || "none"}`);
  console.log("");
  console.log("Sessions by creator:");
  for (const teacher of report.teachers) {
    console.log(`  ${teacher.teacherId}: ${teacher.sessions} sessions, ${teacher.teacherMessages} teacher messages, ${teacher.students} students`);
  }
}

const args = parseArgs(process.argv.slice(2));
const report = await loadUsage(args);
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

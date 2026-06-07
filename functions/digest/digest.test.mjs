/**
 * Tests for weekly digest agent (PEP-297).
 *
 * Tests pure logic functions inline (same pattern as scheduling.test.mjs)
 * since the real module depends on Firebase + external APIs.
 *
 * Run with: node --test functions/digest/digest.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── Inline copies of pure logic under test ─────────────────────────

/**
 * Resolve digest recipients from a list of user docs.
 * Returns active classroomadmins with non-empty manageableClassrooms.
 */
function resolveRecipients(users) {
  return users.filter(
    (u) =>
      u.role === "classroomadmin" &&
      (u.status || "active") === "active" &&
      !u.isPending &&
      Array.isArray(u.manageableClassrooms) &&
      u.manageableClassrooms.length > 0 &&
      u.email
  );
}

/**
 * Assemble per-classroom digest data from statsCache docs and
 * weekly_snapshot escalation docs.
 */
function assembleClassroomData(classroomId, statsCacheDoc, escalations) {
  const teachers = (statsCacheDoc?.teachers || []).map((t) => ({
    name: t.name,
    observations7d: t.observations7d || 0,
    lessons7d: t.lessons7d || 0,
    total7d: (t.observations7d || 0) + (t.lessons7d || 0),
  }));

  const escalatedStudents = escalations
    .filter(
      (e) =>
        e.escalatedThisWeek === true ||
        e.severity === "high" ||
        e.severity === "medium"
    )
    .map((e) => ({
      studentName: e.studentName || e.studentId,
      severity: e.severity,
      isRedFlag: e.redFlag?.severity === "high",
      redFlagReason: e.redFlag?.reason || null,
      coverageGaps: e.coverageGaps || [],
    }))
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2, clear: 3 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

  return {
    classroomId,
    classroomName: statsCacheDoc?.classroomName || classroomId,
    teachers,
    escalatedStudents,
    hasRedFlags: escalatedStudents.some((s) => s.isRedFlag),
  };
}

/**
 * Build the user message for the digest agent from assembled data.
 */
function buildAgentContext(classroomDataList) {
  const sections = classroomDataList.map((cd) => {
    const teacherLines = cd.teachers
      .map((t) => `  - ${t.name}: ${t.total7d} notes (${t.observations7d} obs, ${t.lessons7d} lessons)`)
      .join("\n");

    const escalationLines =
      cd.escalatedStudents.length === 0
        ? "  None"
        : cd.escalatedStudents
          .map((s) => {
            let line = `  - ${s.studentName} [${s.severity.toUpperCase()}]`;
            if (s.isRedFlag) line += ` ⚠️ RED FLAG: ${s.redFlagReason || "no reason given"}`;
            if (s.coverageGaps.length) line += ` (gaps: ${s.coverageGaps.join(", ")})`;
            return line;
          })
          .join("\n");

    return `## ${cd.classroomName}\n\nTeacher Activity (last 7 days):\n${teacherLines}\n\nStudent Escalations:\n${escalationLines}`;
  });

  return sections.join("\n\n---\n\n");
}

// ── Tests ───────────────────────────────────────────────────────────

// ── Recipient Resolution ────────────────────────────────────────────

test("resolveRecipients filters to active classroomadmins with classrooms", () => {
  const users = [
    { email: "yamini@test.com", role: "classroomadmin", status: "active", manageableClassrooms: ["gulmohar", "parijat"], isPending: false },
    { email: "rahul@test.com", role: "superadmin", status: "active", manageableClassrooms: [], isPending: false },
    { email: "geetha@test.com", role: "teacher", status: "active", manageableClassrooms: [], isPending: false },
    { email: "inactive@test.com", role: "classroomadmin", status: "inactive", manageableClassrooms: ["power"], isPending: false },
    { email: "pending@test.com", role: "classroomadmin", status: "active", manageableClassrooms: ["amazing"], isPending: true },
    { email: "empty@test.com", role: "classroomadmin", status: "active", manageableClassrooms: [], isPending: false },
  ];

  const result = resolveRecipients(users);
  assert.equal(result.length, 1);
  assert.equal(result[0].email, "yamini@test.com");
});

test("resolveRecipients returns empty array when no classroomadmins", () => {
  const users = [
    { email: "rahul@test.com", role: "superadmin", status: "active", manageableClassrooms: [], isPending: false },
  ];
  assert.deepEqual(resolveRecipients(users), []);
});

test("classroomadmin with 3 classrooms produces 3 separate email jobs", () => {
  const admin = { email: "yamini@test.com", manageableClassrooms: ["gulmohar", "parijat", "periwinkle"] };
  // Simulate job creation: one job per classroom
  const jobs = admin.manageableClassrooms.map((cid) => ({
    email: admin.email,
    classroomIds: [cid],
  }));
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs[0].classroomIds, ["gulmohar"]);
  assert.deepEqual(jobs[1].classroomIds, ["parijat"]);
  assert.deepEqual(jobs[2].classroomIds, ["periwinkle"]);
});

// ── Data Assembly ───────────────────────────────────────────────────

test("assembleClassroomData extracts teacher 7d stats", () => {
  const statsDoc = {
    classroomName: "Amazing",
    teachers: [
      { name: "Geetha", observations7d: 5, lessons7d: 3 },
      { name: "Naina", observations7d: 0, lessons7d: 0 },
    ],
  };

  const result = assembleClassroomData("amazing", statsDoc, []);
  assert.equal(result.teachers.length, 2);
  assert.equal(result.teachers[0].total7d, 8);
  assert.equal(result.teachers[1].total7d, 0);
  assert.equal(result.escalatedStudents.length, 0);
  assert.equal(result.hasRedFlags, false);
});

test("assembleClassroomData sorts escalations by severity", () => {
  const escalations = [
    { studentId: "s1", studentName: "Alice", severity: "medium", escalatedThisWeek: true },
    { studentId: "s2", studentName: "Bob", severity: "high", escalatedThisWeek: true, redFlag: { severity: "high", reason: "Aggressive behavior" } },
    { studentId: "s3", studentName: "Charlie", severity: "low", escalatedThisWeek: false },
  ];

  const result = assembleClassroomData("power", { classroomName: "Power" }, escalations);
  // Only high + medium pass the filter (low with escalatedThisWeek=false is excluded)
  assert.equal(result.escalatedStudents.length, 2);
  assert.equal(result.escalatedStudents[0].studentName, "Bob");  // high first
  assert.equal(result.escalatedStudents[0].isRedFlag, true);
  assert.equal(result.escalatedStudents[1].studentName, "Alice"); // medium second
  assert.equal(result.hasRedFlags, true);
});

test("assembleClassroomData handles missing statsCache gracefully", () => {
  const result = assembleClassroomData("unknown", null, []);
  assert.equal(result.classroomName, "unknown");
  assert.equal(result.teachers.length, 0);
  assert.equal(result.escalatedStudents.length, 0);
});

test("assembleClassroomData includes escalatedThisWeek even if severity is low", () => {
  const escalations = [
    { studentId: "s1", studentName: "Dana", severity: "low", escalatedThisWeek: true },
  ];
  const result = assembleClassroomData("test", { classroomName: "Test" }, escalations);
  assert.equal(result.escalatedStudents.length, 1);
  assert.equal(result.escalatedStudents[0].studentName, "Dana");
});

// ── Red Flag Emphasis ───────────────────────────────────────────────

test("assembleClassroomData marks red flags distinctly", () => {
  const escalations = [
    {
      studentId: "s1",
      studentName: "Eve",
      severity: "high",
      escalatedThisWeek: true,
      redFlag: { severity: "high", reason: "Repeated withdrawal from group activities" },
      coverageGaps: ["social-emotional"],
    },
  ];

  const result = assembleClassroomData("test", { classroomName: "Test" }, escalations);
  assert.equal(result.escalatedStudents[0].isRedFlag, true);
  assert.equal(result.escalatedStudents[0].redFlagReason, "Repeated withdrawal from group activities");
  assert.deepEqual(result.escalatedStudents[0].coverageGaps, ["social-emotional"]);
});

// ── Agent Context Building ──────────────────────────────────────────

test("buildAgentContext produces structured context for single classroom", () => {
  const data = [{
    classroomId: "amazing",
    classroomName: "Amazing",
    teachers: [
      { name: "Geetha", observations7d: 5, lessons7d: 3, total7d: 8 },
      { name: "Naina", observations7d: 0, lessons7d: 0, total7d: 0 },
    ],
    escalatedStudents: [
      { studentName: "Bob", severity: "high", isRedFlag: true, redFlagReason: "Aggressive behavior", coverageGaps: [] },
    ],
    hasRedFlags: true,
  }];

  const context = buildAgentContext(data);
  assert.ok(context.includes("## Amazing"));
  assert.ok(context.includes("Geetha: 8 notes"));
  assert.ok(context.includes("Naina: 0 notes"));
  assert.ok(context.includes("Bob [HIGH]"));
  assert.ok(context.includes("RED FLAG"));
  assert.ok(context.includes("Aggressive behavior"));
});

test("buildAgentContext shows None for classrooms with no escalations", () => {
  const data = [{
    classroomId: "power",
    classroomName: "Power",
    teachers: [{ name: "Dewanshi", observations7d: 10, lessons7d: 5, total7d: 15 }],
    escalatedStudents: [],
    hasRedFlags: false,
  }];

  const context = buildAgentContext(data);
  assert.ok(context.includes("None"));
});

test("buildAgentContext handles multiple classrooms with separator", () => {
  const data = [
    {
      classroomId: "amazing",
      classroomName: "Amazing",
      teachers: [],
      escalatedStudents: [],
      hasRedFlags: false,
    },
    {
      classroomId: "power",
      classroomName: "Power",
      teachers: [],
      escalatedStudents: [],
      hasRedFlags: false,
    },
  ];

  const context = buildAgentContext(data);
  assert.ok(context.includes("## Amazing"));
  assert.ok(context.includes("## Power"));
  assert.ok(context.includes("---"));
});

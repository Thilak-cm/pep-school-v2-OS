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

// ── Recipient Resolution ────────────────────────────────────────────

/**
 * Resolve classroomadmin digest recipients.
 */
function resolveClassroomAdminRecipients(users) {
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
 * Resolve superadmin recipients.
 */
function resolveSuperAdminRecipients(users) {
  return users.filter(
    (u) =>
      u.role === "superadmin" &&
      (u.status || "active") === "active" &&
      !u.isPending &&
      u.email
  );
}

/**
 * Resolve superadmin classroom overrides.
 * Returns Map<email, classroomId[]> for superadmins who should also
 * receive per-classroom emails.
 */
function resolveSuperAdminOverrides(config, superAdmins) {
  const overrides = config?.superadminClassroomOverrides || {};
  const result = new Map();
  for (const sa of superAdmins) {
    const classrooms = overrides[sa.id];
    if (Array.isArray(classrooms) && classrooms.length > 0) {
      result.set(sa.email, classrooms);
    }
  }
  return result;
}

// ── Data Assembly ───────────────────────────────────────────────────

/**
 * Build the first user message for the per-classroom agent.
 * Contains mandatory context: classroom doc + statsCache.
 */
function buildFirstUserMessage(classroomDoc, statsCacheDoc, contextualNotes, snapshotsMap = null, writingMap = null) {
  const classroom = {
    id: classroomDoc.id,
    name: classroomDoc.name || classroomDoc.id,
    program: classroomDoc.programId || "unknown",
    teacherIds: classroomDoc.teacherIds || [],
  };

  const teachers = (statsCacheDoc?.teachers || []).map((t) => ({
    name: t.name,
    observations7d: t.observations7d || 0,
    lessons7d: t.lessons7d || 0,
    total7d: (t.observations7d || 0) + (t.lessons7d || 0),
    observations: t.observations || 0,
    lessons: t.lessons || 0,
  }));

  const students = (statsCacheDoc?.students || []).map((s) => ({
    id: s.id,
    name: s.name,
    thisWeekNotes: s.thisWeekNotes || 0,
    last14DaysNotes: s.last14DaysNotes || 0,
    last42DaysNotes: s.last42DaysNotes || 0,
    totalNotes: s.totalNotes || 0,
  }));

  const notesSection = contextualNotes
    ? ["## School Contextual Notes", contextualNotes, ""]
    : [];

  const studentLines = students.flatMap((s) => {
    const notePart = `this week ${s.thisWeekNotes}, last 14d ${s.last14DaysNotes}, last 42d ${s.last42DaysNotes}, total ${s.totalNotes}`;
    const snap = snapshotsMap?.get(s.id);
    let mainLine;
    if (!snap) {
      mainLine = `- ${s.name}: ${notePart} | no weekly snapshot yet`;
    } else {
      const severity = snap.severity || "none";
      const escalated = snap.escalatedThisWeek ? " | ESCALATED" : "";
      const improved = snap.improvedThisWeek ? " | improved" : "";
      const redFlag = snap.redFlag ? ` | RED FLAG: ${snap.redFlag.severity} — ${snap.redFlag.reason}` : "";
      const gaps = snap.coverageGaps?.length ? ` | gaps: ${snap.coverageGaps.join(", ")}` : "";
      mainLine = `- ${s.name}: ${notePart} | severity ${severity}${escalated}${improved}${redFlag}${gaps}`;
    }

    // Writing analysis teaser (indented second bullet)
    const writing = writingMap?.get(s.id);
    let writingLine;
    if (!writing) {
      writingLine = "  - Writing: no writing analysis yet";
    } else {
      const dims = writing.dimensionRatings || {};
      const dimParts = Object.entries(dims)
        .map(([name, r]) => `${name}: ${r.score}/5 ${r.trend}`)
        .join(", ");
      const narrative = writing.narrative || "No narrative";
      writingLine = `  - Writing: ${writing.sampleCount || 0} samples | "${narrative}" | ${dimParts}`;
    }

    return [mainLine, writingLine];
  });

  return [
    `# Classroom: ${classroom.name}`,
    `Program: ${classroom.program}`,
    `Teachers: ${classroom.teacherIds.length}`,
    `Students: ${students.length}`,
    "",
    ...notesSection,
    "## Teacher Activity (last 7 days)",
    ...teachers.map(
      (t) =>
        `- ${t.name}: ${t.total7d} notes (${t.observations7d} obs, ${t.lessons7d} lessons) | all-time: ${t.observations + t.lessons}`
    ),
    "",
    "## Students",
    ...studentLines,
    "",
    "Generate a weekly digest email for this classroom.",
  ].join("\n");
}

// ── Progressive Disclosure ──────────────────────────────────────────

/**
 * Tracks which students have had their weekly_snapshot fetched.
 * Enforces: snapshot_history can only be accessed after weekly_snapshot.
 */
class ToolGatekeeper {
  constructor() {
    this.snapshotFetched = new Set();
  }

  recordSnapshotFetch(studentId) {
    this.snapshotFetched.add(studentId);
  }

  canAccessHistory(studentId) {
    return this.snapshotFetched.has(studentId);
  }
}

// ── Agent Loop (inline for testing) ─────────────────────────────────

/**
 * Simulate agent loop logic: process LLM responses, handle tool calls.
 * Returns { finalContent, toolCallLog }.
 */
async function runAgentLoop(mockResponses, toolExecutor, maxIterations = 10) {
  const messages = [
    { role: "system", content: "test system prompt" },
    { role: "user", content: "test user message" },
  ];
  const toolCallLog = [];
  let iteration = 0;

  for (const response of mockResponses) {
    iteration++;
    if (iteration > maxIterations) {
      throw new Error("Max iterations exceeded");
    }

    // Append assistant message
    messages.push(response);

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Process tool calls
      for (const tc of response.tool_calls) {
        const result = await toolExecutor(tc.function.name, JSON.parse(tc.function.arguments));
        toolCallLog.push({ name: tc.function.name, args: JSON.parse(tc.function.arguments), result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    } else if (response.content) {
      // Final response — agent is done
      return { finalContent: response.content, toolCallLog, messages, iterations: iteration };
    }
  }

  throw new Error("Agent loop ended without final content");
}

// ── Digest Storage Schema ───────────────────────────────────────────

/**
 * Validate a digest doc matches the expected schema.
 */
function validateDigestDoc(doc) {
  const required = ["weekKey", "htmlContent", "agentModel", "generatedAt", "recipientEmails", "hasRedFlags", "toolCallCount"];
  const missing = required.filter((k) => !(k in doc));
  return { valid: missing.length === 0, missing };
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

// ── Recipient Resolution ────────────────────────────────────────────

test("resolveClassroomAdminRecipients filters correctly", () => {
  const users = [
    { email: "yamini@test.com", role: "classroomadmin", status: "active", manageableClassrooms: ["gulmohar", "parijat"], isPending: false },
    { email: "rahul@test.com", role: "superadmin", status: "active", manageableClassrooms: [], isPending: false },
    { email: "geetha@test.com", role: "teacher", status: "active", manageableClassrooms: [], isPending: false },
    { email: "inactive@test.com", role: "classroomadmin", status: "inactive", manageableClassrooms: ["power"], isPending: false },
    { email: "pending@test.com", role: "classroomadmin", status: "active", manageableClassrooms: ["amazing"], isPending: true },
    { email: "empty@test.com", role: "classroomadmin", status: "active", manageableClassrooms: [], isPending: false },
  ];
  const result = resolveClassroomAdminRecipients(users);
  assert.equal(result.length, 1);
  assert.equal(result[0].email, "yamini@test.com");
});

test("resolveSuperAdminRecipients returns active superadmins", () => {
  const users = [
    { email: "rahul@test.com", role: "superadmin", status: "active", isPending: false },
    { email: "thilak@test.com", role: "superadmin", status: "active", isPending: false },
    { email: "yamini@test.com", role: "classroomadmin", status: "active", isPending: false },
  ];
  const result = resolveSuperAdminRecipients(users);
  assert.equal(result.length, 2);
});

test("classroomadmin with 3 classrooms produces 3 email jobs", () => {
  const admin = { email: "yamini@test.com", manageableClassrooms: ["gulmohar", "parijat", "periwinkle"] };
  const jobs = admin.manageableClassrooms.map((cid) => ({
    email: admin.email,
    classroomId: cid,
  }));
  assert.equal(jobs.length, 3);
  assert.equal(jobs[0].classroomId, "gulmohar");
});

// ── Superadmin Overrides ────────────────────────────────────────────

test("resolveSuperAdminOverrides maps UID to classrooms", () => {
  const config = {
    superadminClassroomOverrides: {
      "uid-rahul": ["allstars"],
      "uid-chetan": ["power", "amazing"],
    },
  };
  const superAdmins = [
    { id: "uid-rahul", email: "rahul@test.com" },
    { id: "uid-chetan", email: "chetan@test.com" },
    { id: "uid-thilak", email: "thilak@test.com" },
  ];
  const result = resolveSuperAdminOverrides(config, superAdmins);
  assert.equal(result.size, 2);
  assert.deepEqual(result.get("rahul@test.com"), ["allstars"]);
  assert.deepEqual(result.get("chetan@test.com"), ["power", "amazing"]);
  assert.equal(result.has("thilak@test.com"), false);
});

test("resolveSuperAdminOverrides handles missing config", () => {
  const result = resolveSuperAdminOverrides({}, [{ id: "uid-1", email: "a@test.com" }]);
  assert.equal(result.size, 0);
});

// ── First User Message ──────────────────────────────────────────────

test("buildFirstUserMessage includes classroom, stats, and contextual notes", () => {
  const classroomDoc = { id: "amazing", name: "Amazing", programId: "primary", teacherIds: ["t1", "t2"], studentCount: 20 };
  const statsDoc = {
    teachers: [
      { name: "Geetha", observations7d: 5, lessons7d: 3, observations: 421, lessons: 577 },
      { name: "Naina", observations7d: 0, lessons7d: 0, observations: 100, lessons: 50 },
    ],
    students: [
      { id: "s1", name: "Alice", thisWeekNotes: 3, last14DaysNotes: 8, last42DaysNotes: 15, totalNotes: 30 },
      { id: "s2", name: "Bob", thisWeekNotes: 0, last14DaysNotes: 2, last42DaysNotes: 8, totalNotes: 20 },
    ],
  };
  const notes = "- Diana is admin, not a teacher.\n- Summer break April-May.";
  const msg = buildFirstUserMessage(classroomDoc, statsDoc, notes);
  assert.ok(msg.includes("# Classroom: Amazing"));
  assert.ok(msg.includes("Program: primary"));
  assert.ok(msg.includes("Geetha: 8 notes"));
  assert.ok(msg.includes("Naina: 0 notes"));
  assert.ok(msg.includes("- Alice: this week 3"));
  assert.ok(!msg.includes("[s1]"), "should not include student IDs");
  assert.ok(msg.includes("- Bob: this week 0"));
  assert.ok(!msg.includes("[s2]"), "should not include student IDs");
  assert.ok(msg.includes("last 14d"), "should include 14-day window");
  assert.ok(msg.includes("## School Contextual Notes"));
  assert.ok(msg.includes("Diana is admin"));
  assert.ok(msg.includes("Summer break"));
  assert.ok(msg.includes("no writing analysis yet"), "should show writing placeholder");
});

test("buildFirstUserMessage handles missing statsCache and empty notes", () => {
  const msg = buildFirstUserMessage({ id: "test", name: "Test" }, null, "");
  assert.ok(msg.includes("# Classroom: Test"));
  assert.ok(msg.includes("## Teacher Activity"));
  assert.ok(msg.includes("## Students"));
  assert.ok(!msg.includes("## School Contextual Notes"));
});

test("buildFirstUserMessage shows 'no weekly snapshot yet' when snapshotsMap is null", () => {
  const statsDoc = {
    teachers: [],
    students: [{ id: "s1", name: "Alice", thisWeekNotes: 1, last14DaysNotes: 3, last42DaysNotes: 5, totalNotes: 10 }],
  };
  const msg = buildFirstUserMessage({ id: "test", name: "Test" }, statsDoc, "", null);
  assert.ok(msg.includes("no weekly snapshot yet"), "should indicate missing snapshot");
});

test("buildFirstUserMessage merges note counts and snapshot flags per student", () => {
  const classroomDoc = { id: "cosmos", name: "Cosmos", programId: "elementary", teacherIds: ["t1"] };
  const statsDoc = {
    teachers: [{ name: "Geetha", observations7d: 3, lessons7d: 1, observations: 100, lessons: 50 }],
    students: [
      { id: "s1", name: "Alice", thisWeekNotes: 2, last14DaysNotes: 5, last42DaysNotes: 10, totalNotes: 25 },
      { id: "s2", name: "Bob", thisWeekNotes: 0, last14DaysNotes: 0, last42DaysNotes: 0, totalNotes: 0 },
    ],
  };
  const snapshots = new Map([
    ["s1", { severity: "low", summary: "Alice showed steady engagement.", coverageGaps: ["Sensorial"], redFlag: null, escalatedThisWeek: false, improvedThisWeek: true }],
    ["s2", { severity: "high", summary: "Bob has zero notes.", coverageGaps: [], redFlag: { severity: "high", reason: "No activity in 42 days" }, escalatedThisWeek: true, improvedThisWeek: false }],
  ]);
  const msg = buildFirstUserMessage(classroomDoc, statsDoc, "", snapshots);
  assert.ok(msg.includes("## Students"));
  assert.ok(!msg.includes("## Student Note Counts"), "should be merged into Students");
  assert.ok(!msg.includes("## Weekly Snapshots"), "should be merged into Students");
  // Alice: note counts + flags on one line (no student ID)
  assert.ok(msg.includes("- Alice: this week 2, last 14d 5, last 42d 10, total 25 | severity low"));
  assert.ok(!msg.includes("[s1]"), "should not include student IDs");
  assert.ok(msg.includes("improved"));
  assert.ok(!msg.includes("Alice showed steady engagement."), "summary should not be in prompt");
  // Bob: note counts + flags on one line (no student ID)
  assert.ok(msg.includes("- Bob: this week 0, last 14d 0, last 42d 0, total 0 | severity high"));
  assert.ok(!msg.includes("[s2]"), "should not include student IDs");
  assert.ok(msg.includes("ESCALATED"));
  assert.ok(msg.includes("RED FLAG: high"));
  assert.ok(msg.includes("No activity in 42 days"));
  assert.ok(!msg.includes("Bob has zero notes."), "summary should not be in prompt");
});

test("buildFirstUserMessage includes writing analysis teaser when writingMap provided", () => {
  const classroomDoc = { id: "test", name: "Test", programId: "primary", teacherIds: ["t1"] };
  const statsDoc = {
    teachers: [],
    students: [
      { id: "s1", name: "Alice", thisWeekNotes: 2, last14DaysNotes: 5, last42DaysNotes: 10, totalNotes: 25 },
      { id: "s2", name: "Bob", thisWeekNotes: 1, last14DaysNotes: 3, last42DaysNotes: 6, totalNotes: 12 },
    ],
  };
  const writingMap = new Map([
    ["s1", {
      narrative: "Alice shows improving letter formation.",
      sampleCount: 4,
      dimensionRatings: {
        handwriting: { score: 3, trend: "improving", evidence: "..." },
        spelling: { score: 2, trend: "declining", evidence: "..." },
      },
    }],
  ]);
  const msg = buildFirstUserMessage(classroomDoc, statsDoc, "", null, writingMap);
  // Alice has writing analysis
  assert.ok(msg.includes('Writing: 4 samples | "Alice shows improving letter formation."'), "should include narrative teaser");
  assert.ok(msg.includes("handwriting: 3/5 improving"), "should include dim ratings");
  assert.ok(msg.includes("spelling: 2/5 declining"), "should include dim ratings");
  // Bob does not
  assert.ok(msg.includes("no writing analysis yet"), "should show placeholder for missing writing");
});

// ── Progressive Disclosure ──────────────────────────────────────────

test("ToolGatekeeper blocks history before snapshot fetch", () => {
  const gate = new ToolGatekeeper();
  assert.equal(gate.canAccessHistory("student-1"), false);
});

test("ToolGatekeeper allows history after snapshot fetch", () => {
  const gate = new ToolGatekeeper();
  gate.recordSnapshotFetch("student-1");
  assert.equal(gate.canAccessHistory("student-1"), true);
});

test("ToolGatekeeper is per-student, not global", () => {
  const gate = new ToolGatekeeper();
  gate.recordSnapshotFetch("student-1");
  assert.equal(gate.canAccessHistory("student-1"), true);
  assert.equal(gate.canAccessHistory("student-2"), false);
});

// ── Agent Loop ──────────────────────────────────────────────────────

test("agent loop terminates on content-only response", async () => {
  const responses = [
    { role: "assistant", content: "<div>Final email</div>" },
  ];
  const result = await runAgentLoop(responses, () => ({}));
  assert.equal(result.finalContent, "<div>Final email</div>");
  assert.equal(result.toolCallLog.length, 0);
  assert.equal(result.iterations, 1);
});

test("agent loop processes tool calls then terminates", async () => {
  const responses = [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "tc1", function: { name: "fetch_weekly_snapshot", arguments: '{"studentId":"s1"}' } },
      ],
    },
    {
      role: "assistant",
      content: "<div>Email with snapshot insight</div>",
    },
  ];
  const executor = () => ({ severity: "high", escalatedThisWeek: true });
  const result = await runAgentLoop(responses, executor);
  assert.equal(result.finalContent, "<div>Email with snapshot insight</div>");
  assert.equal(result.toolCallLog.length, 1);
  assert.equal(result.toolCallLog[0].name, "fetch_weekly_snapshot");
  assert.equal(result.iterations, 2);
});

test("agent loop handles multiple tool calls in one response", async () => {
  const responses = [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "tc1", function: { name: "fetch_weekly_snapshot", arguments: '{"studentId":"s1"}' } },
        { id: "tc2", function: { name: "fetch_weekly_snapshot", arguments: '{"studentId":"s2"}' } },
      ],
    },
    {
      role: "assistant",
      content: "<div>Done</div>",
    },
  ];
  const executor = () => ({ severity: "clear" });
  const result = await runAgentLoop(responses, executor);
  assert.equal(result.toolCallLog.length, 2);
});

test("agent loop enforces max iterations", async () => {
  // 3 responses, all tool calls, no final content — should exceed max
  const responses = Array(3).fill({
    role: "assistant",
    content: null,
    tool_calls: [{ id: "tc", function: { name: "test", arguments: "{}" } }],
  });
  await assert.rejects(
    () => runAgentLoop(responses, () => ({}), 2),
    { message: "Max iterations exceeded" }
  );
});

// ── Digest Storage Schema ───────────────────────────────────────────

test("validateDigestDoc passes with all required fields", () => {
  const doc = {
    weekKey: "2026-W23",
    htmlContent: "<div>test</div>",
    agentModel: "openai/gpt-4.1-mini",
    generatedAt: new Date(),
    recipientEmails: ["yamini@test.com"],
    hasRedFlags: false,
    toolCallCount: 0,
  };
  const result = validateDigestDoc(doc);
  assert.equal(result.valid, true);
  assert.equal(result.missing.length, 0);
});

test("validateDigestDoc fails on missing fields", () => {
  const doc = { weekKey: "2026-W23", htmlContent: "<div>test</div>" };
  const result = validateDigestDoc(doc);
  assert.equal(result.valid, false);
  assert.ok(result.missing.includes("agentModel"));
  assert.ok(result.missing.includes("generatedAt"));
});

// ── Renderer Tests ─────────────────────────────────────────────────

import { renderClassroomDigest, renderSuperadminDigest, parseAndRender } from "./renderHtml.js";

test("renderClassroomDigest renders new negligence and handwriting sections", () => {
  const data = {
    title: "June Week 26 Digest — Amazing",
    urgent: [{ name: "Alice", content: "Red flag.", action: "Call parents." }],
    negligence: ["Bob: 0 notes in 14 days, usually averages 5."],
    curriculum: ["Sensorial under-documented."],
    handwriting: ["Charlie: handwriting legibility declining, score dropped to 1/5."],
    bright: ["Diana: improved steadily."],
    teachers: "Eve has been inactive.",
    watch: ["Frank: severity increased to medium."],
  };
  const html = renderClassroomDigest(data);
  // Verify section order: urgent before negligence before curriculum before handwriting before bright before teachers before watch
  const urgentPos = html.indexOf("Urgent");
  const negligencePos = html.indexOf("Student negligence");
  const curriculumPos = html.indexOf("Curriculum blind spots");
  const handwritingPos = html.indexOf("Handwriting highlights");
  const brightPos = html.indexOf("Bright spots");
  const teachersPos = html.indexOf("Teacher documentation");
  const watchPos = html.indexOf("Watch");
  assert.ok(urgentPos < negligencePos, "urgent before negligence");
  assert.ok(negligencePos < curriculumPos, "negligence before curriculum");
  assert.ok(curriculumPos < handwritingPos, "curriculum before handwriting");
  assert.ok(handwritingPos < brightPos, "handwriting before bright");
  assert.ok(brightPos < teachersPos, "bright before teachers");
  assert.ok(teachersPos < watchPos, "teachers before watch");
  // Verify content rendered
  assert.ok(html.includes("Bob: 0 notes in 14 days"));
  assert.ok(html.includes("Charlie: handwriting legibility declining"));
  // Verify negligence has amber styling
  assert.ok(html.includes("#d4a017"), "negligence should use amber color");
});

test("renderClassroomDigest omits empty sections", () => {
  const data = { title: "Test Digest", bright: ["Good work."] };
  const html = renderClassroomDigest(data);
  assert.ok(!html.includes("Urgent"), "should omit empty urgent");
  assert.ok(!html.includes("negligence"), "should omit empty negligence");
  assert.ok(!html.includes("Handwriting"), "should omit empty handwriting");
  assert.ok(!html.includes("Watch"), "should omit empty watch");
  assert.ok(html.includes("Bright spots"), "should render non-empty section");
});

test("renderSuperadminDigest renders per-program cards", () => {
  const data = {
    title: "Executive Digest — June Week 26",
    programs: [
      {
        programId: "primary",
        programName: "Primary",
        critical: [{ name: "Alice", classroom: "Gulmohar", content: "Red flag.", action: "Intervene." }],
        patterns: ["Documentation declining across primary classrooms."],
      },
      {
        programId: "elementary",
        programName: "Elementary",
        bright: ["Bob improved in Power classroom."],
      },
      {
        programId: "toddler",
        programName: "Toddler",
        // no sections — should show "no concerns"
      },
    ],
  };
  const html = renderSuperadminDigest(data);
  // All programs rendered
  assert.ok(html.includes("Primary"), "should render primary card");
  assert.ok(html.includes("Elementary"), "should render elementary card");
  assert.ok(html.includes("Toddler"), "should render toddler card");
  // Content within cards
  assert.ok(html.includes("Alice"), "should include critical student");
  assert.ok(html.includes("Documentation declining"), "should include pattern");
  assert.ok(html.includes("Bob improved"), "should include bright spot");
  assert.ok(html.includes("No concerns this week"), "empty program should show no concerns");
  // Verify program card has border styling
  assert.ok(html.includes("border:1px solid #ddd"), "cards should have border");
});

test("parseAndRender works with new superadmin schema", () => {
  const json = JSON.stringify({
    title: "Exec Digest",
    programs: [
      { programId: "primary", programName: "Primary", bright: ["Good."] },
    ],
  });
  const html = parseAndRender(json, renderSuperadminDigest);
  assert.ok(html.includes("Primary"));
  assert.ok(html.includes("Good."));
});

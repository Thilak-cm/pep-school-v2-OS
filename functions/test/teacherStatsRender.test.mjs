import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailySeries,
  buildTeacherSections,
  previousWeekStartDay,
  renderAdminEmail,
  renderBarChart,
  renderStatsTable,
  renderTeacherEmail,
  resolveRecipients,
  totalNotes,
} from "../digest/renderTeacherStats.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (iso) => Math.floor(Date.parse(iso) / DAY_MS);

const teacherRow = (id, overrides = {}) => ({
  id, name: `Teacher ${id}`, email: `${id}@pep.school`, status: "active",
  observations: 10, lessons: 4, media: 3, handwritten: 1, assessments: 2, questionsAnswered: 5,
  observations7d: 5, lessons7d: 2, media7d: 1, handwritten7d: 0, assessments7d: 1, questionsAnswered7d: 2,
  observations30d: 8, lessons30d: 3, media30d: 2, handwritten30d: 1, assessments30d: 2, questionsAnswered30d: 4,
  studentsReached: 20, studentsReached7d: 12, studentsReached30d: 18,
  ...overrides,
});

const cache = (classroomId, teachers, teacherRecent = {}, overrides = {}) => ({
  classroomId, classroomName: overrides.classroomName || classroomId.toUpperCase(),
  studentCount: overrides.studentCount ?? 35,
  teachers,
  aggregationState: {version: 2, teacherRecent, studentRecent: {}},
});

test("previous week starts on the Monday before the run date", () => {
  // 2026-09-07 is a Monday → previous week is Aug 31 – Sep 6.
  assert.equal(previousWeekStartDay(Date.parse("2026-09-07T06:30:00Z")), day("2026-08-31T00:00:00Z"));
  // Mid-week runs (test trigger on a Thursday) still anchor to previous Monday.
  assert.equal(previousWeekStartDay(Date.parse("2026-09-10T18:00:00Z")), day("2026-08-31T00:00:00Z"));
});

test("totalNotes sums observations, lessons, media, and assessments per window", () => {
  const row = teacherRow("t1");
  assert.equal(totalNotes(row, ""), 19);
  assert.equal(totalNotes(row, "7d"), 9);
  assert.equal(totalNotes(row, "30d"), 15);
});

test("daily series aggregates note counts across classrooms with Mon–Sun labels", () => {
  const weekStart = day("2026-08-31T00:00:00Z");
  const mon = String(weekStart);
  const wed = String(weekStart + 2);
  const caches = [
    cache("c1", [teacherRow("t1")], {t1: {[mon]: {observations: 2, lessons: 1, media: 0, handwritten: 0, assessments: 1, questionsAnswered: 1}}}),
    cache("c2", [teacherRow("t1")], {t1: {[mon]: {observations: 1, lessons: 0, media: 1, handwritten: 0, assessments: 0, questionsAnswered: 0}, [wed]: {observations: 3, lessons: 0, media: 0, handwritten: 0, assessments: 0, questionsAnswered: 0}}}),
  ];
  const series = buildDailySeries(caches, "t1", weekStart);
  assert.equal(series.length, 7);
  assert.deepEqual(series.map((item) => item.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.equal(series[0].count, 6);
  assert.equal(series[1].count, 0);
  assert.equal(series[2].count, 3);
  // questionsAnswered overlaps other counters and must not inflate the bars.
  assert.equal(series.reduce((sum, item) => sum + item.count, 0), 9);
});

test("teacher sections cover every classroom the teacher appears in", () => {
  const caches = [
    cache("c1", [teacherRow("t1"), teacherRow("t2")]),
    cache("c2", [teacherRow("t2")], {}, {studentCount: 12}),
  ];
  const sections = buildTeacherSections(caches, "t2");
  assert.equal(sections.length, 2);
  assert.deepEqual(sections.map((section) => section.classroomName), ["C1", "C2"]);
  assert.equal(sections[1].studentCount, 12);
  assert.equal(sections[1].row.id, "t2");
  assert.equal(buildTeacherSections(caches, "t1").length, 1);
});

test("recipient resolution enforces role, status, email, and cache presence", () => {
  const caches = [cache("c1", [teacherRow("t1"), teacherRow("t2"), teacherRow("t3"), teacherRow("pending_x"), teacherRow("t4"), teacherRow("admin1")])];
  const users = new Map([
    ["t1", {id: "t1", role: "teacher", status: "active", email: "t1@pep.school", displayName: "T One"}],
    ["t2", {id: "t2", role: "teacher", status: "pending", email: "t2@pep.school", displayName: "T Two"}],
    ["t3", {id: "t3", role: "teacher", status: "active", email: "", displayName: "T Three"}],
    ["t4", {id: "t4", role: "teacher", status: "active", email: "t4@pep.school", displayName: "T Four"}],
    ["t5", {id: "t5", role: "teacher", status: "active", email: "t5@pep.school", displayName: "Not In Cache"}],
    ["admin1", {id: "admin1", role: "classroomadmin", status: "active", email: "a1@pep.school", displayName: "Admin One", manageableClassrooms: ["c1"]}],
    ["admin2", {id: "admin2", role: "classroomadmin", status: "active", email: "a2@pep.school", displayName: "Admin Two", manageableClassrooms: ["c1", "c9"]}],
    ["admin3", {id: "admin3", role: "classroomadmin", status: "active", email: "", displayName: "Admin Three", manageableClassrooms: ["c1"]}],
    ["sa", {id: "sa", role: "superadmin", status: "active", email: "sa@pep.school", displayName: "Super"}],
  ]);
  const {teachers, admins} = resolveRecipients(caches, users);
  // Active + email + in cache. Pending status, empty email, absent-from-cache,
  // pending_ rows without user docs, and admins are all excluded from teachers.
  assert.deepEqual(teachers.map((item) => item.id).sort(), ["t1", "t4"]);
  // Admins need role + email + manageableClassrooms; cache presence not required.
  assert.deepEqual(admins.map((item) => item.id).sort(), ["admin1", "admin2"]);
});

test("bar chart renders seven bars with counts and handles all-zero weeks", () => {
  const series = [
    {label: "Mon", count: 17}, {label: "Tue", count: 43}, {label: "Wed", count: 35},
    {label: "Thu", count: 37}, {label: "Fri", count: 13}, {label: "Sat", count: 0}, {label: "Sun", count: 0},
  ];
  const html = renderBarChart(series);
  assert.equal((html.match(/<td /g) || []).length, 7);
  for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) assert.ok(html.includes(`>${label}<`));
  assert.ok(html.includes(">43<"));
  const flat = renderBarChart(series.map((item) => ({...item, count: 0})));
  assert.equal((flat.match(/<td /g) || []).length, 7);
});

test("stats table shows all rows, windows, and children covered formats", () => {
  const html = renderStatsTable(teacherRow("t1"), 35);
  for (const label of ["Observations", "Lessons", "Media", "Assessments", "Questions answered", "Total notes", "Children covered"]) {
    assert.ok(html.includes(label), `missing row ${label}`);
  }
  assert.ok(html.includes("All time"));
  assert.equal(html.includes("Year to date"), false);
  // Children covered: X/Y for 7d and 30d, plain count for all time.
  assert.ok(html.includes("12/35"));
  assert.ok(html.includes("18/35"));
  assert.ok(html.includes(">20<"));
  // Total notes per window.
  assert.ok(html.includes(">9<"));
  assert.ok(html.includes(">15<"));
  assert.ok(html.includes(">19<"));
});

test("teacher email renders chart, classroom sections, and zero-activity weeks", () => {
  const series = Array.from({length: 7}, (_, index) => ({label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], count: 0}));
  const zeroRow = teacherRow("t1", {
    observations: 0, lessons: 0, media: 0, assessments: 0, questionsAnswered: 0,
    observations7d: 0, lessons7d: 0, media7d: 0, assessments7d: 0, questionsAnswered7d: 0,
    observations30d: 0, lessons30d: 0, media30d: 0, assessments30d: 0, questionsAnswered30d: 0,
    studentsReached: 0, studentsReached7d: 0, studentsReached30d: 0,
  });
  const html = renderTeacherEmail({
    teacherName: "Hemapriya TS",
    weekLabel: "Sep 1-7, 2026",
    series,
    sections: [{classroomName: "Periwinkle", studentCount: 37, row: zeroRow}],
  });
  assert.ok(html.includes("Hemapriya TS"));
  assert.ok(html.includes("Sep 1-7, 2026"));
  assert.ok(html.includes("Periwinkle"));
  assert.ok(html.includes("<table"));
  assert.ok(html.includes("Total this week: 0 notes"));
  assert.ok(html.includes("0/37"));
});

test("admin email includes conditional self section and per-classroom teacher blocks", () => {
  const series = [{label: "Mon", count: 2}, {label: "Tue", count: 0}, {label: "Wed", count: 0}, {label: "Thu", count: 0}, {label: "Fri", count: 0}, {label: "Sat", count: 0}, {label: "Sun", count: 0}];
  const classrooms = [{
    classroomName: "Gulmohar", studentCount: 35,
    teachers: [
      {name: "Ramya", isSelf: false, row: teacherRow("t9")},
      {name: "Yamini", isSelf: true, row: teacherRow("admin1")},
    ],
  }];
  const withSelf = renderAdminEmail({
    adminName: "Yamini",
    weekLabel: "Sep 1-7, 2026",
    self: {series, sections: [{classroomName: "Parijat", studentCount: 2, row: teacherRow("admin1")}]},
    classrooms,
  });
  assert.ok(withSelf.includes("Your activity"));
  assert.ok(withSelf.includes("Parijat"));
  assert.ok(withSelf.includes("(you)"));
  assert.ok(withSelf.includes("Gulmohar"));
  assert.ok(withSelf.includes("(2 teachers, 35 students)"));
  const withoutSelf = renderAdminEmail({adminName: "Yamini", weekLabel: "Sep 1-7, 2026", self: null, classrooms});
  assert.equal(withoutSelf.includes("Your activity"), false);
  assert.ok(withoutSelf.includes("Gulmohar"));
});

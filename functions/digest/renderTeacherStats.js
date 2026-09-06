/**
 * Pure renderers and data shaping for the weekly teacher stats email (#274).
 *
 * No imports on purpose: everything here is deterministic and unit-testable
 * without Firebase/Resend side effects. All I/O lives in teacherStats.js.
 * Visual reference: docs/weekly-teacher-stats-email-mockup.html.
 *
 * Known limitation (accepted in #274 planning): day buckets reuse the stats
 * cache's UTC dayKey convention, so notes captured before 05:30 IST attribute
 * to the previous weekday bar. Acceptable skew for a school-hours product.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NOTE_FIELDS = ["observations", "lessons", "media", "assessments"];

const fmt = (value) => Number(value || 0).toLocaleString("en-US");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;").replaceAll("'", "&#39;");

/** UTC day number of the Monday starting the week before the run date. */
export function previousWeekStartDay(nowMs) {
  const currentDay = Math.floor(nowMs / DAY_MS);
  // Epoch day 0 (1970-01-01) was a Thursday → Monday-based weekday index.
  const mondayOffset = (currentDay + 3) % 7;
  return currentDay - mondayOffset - 7;
}

/** Notes for one window: observations + lessons + media + assessments. */
export function totalNotes(row, suffix = "") {
  return NOTE_FIELDS.reduce((sum, field) => sum + (row?.[`${field}${suffix}`] || 0), 0);
}

/** Mon–Sun daily note counts for one teacher, aggregated across classrooms. */
export function buildDailySeries(caches, teacherId, weekStartDay) {
  return WEEKDAY_LABELS.map((label, index) => {
    const key = String(weekStartDay + index);
    let count = 0;
    for (const cache of caches) {
      const counts = cache?.aggregationState?.teacherRecent?.[teacherId]?.[key];
      if (counts) count += NOTE_FIELDS.reduce((sum, field) => sum + (counts[field] || 0), 0);
    }
    return {label, count};
  });
}

/** One section per classroom the teacher appears in. */
export function buildTeacherSections(caches, teacherId) {
  const sections = [];
  for (const cache of caches) {
    const row = (cache.teachers || []).find((teacher) => teacher.id === teacherId);
    if (row) sections.push({classroomName: cache.classroomName || cache.classroomId, studentCount: cache.studentCount || 0, row});
  }
  return sections;
}

/**
 * Resolve email recipients from statsCache docs + user docs.
 * Teachers: active, non-pending, with email, present in ≥1 cache roster.
 * Classroomadmins: active, with email and manageableClassrooms — cache
 * presence not required (they get the combined email regardless).
 */
export function resolveRecipients(caches, users) {
  const inCache = new Set();
  for (const cache of caches) for (const row of cache.teachers || []) inCache.add(row.id);
  const active = (user) => (user.status || "active") === "active";
  const teachers = [];
  const admins = [];
  for (const user of users.values()) {
    if (!user.email || !active(user)) continue;
    if (user.role === "teacher" && inCache.has(user.id)) {
      teachers.push({id: user.id, email: user.email, name: user.displayName || user.email});
    } else if (user.role === "classroomadmin" && user.manageableClassrooms?.length) {
      admins.push({id: user.id, email: user.email, name: user.displayName || user.email, classroomIds: user.manageableClassrooms});
    }
  }
  return {teachers, admins};
}

/**
 * HTML/CSS bar chart — Gmail strips <svg>, so we use stacked table cells with
 * inline background-color and height. Works in Gmail, Outlook, Apple Mail.
 */
export function renderBarChart(series) {
  const max = Math.max(...series.map((item) => item.count));
  const maxHeight = 100;
  const barWidth = 36;
  const cells = series.map((item) => {
    const height = max > 0 ? Math.round((item.count / max) * maxHeight) : 0;
    const barHtml = item.count > 0
      ? `<div style="font-size:11px;font-weight:bold;color:#4a7c59;margin-bottom:4px;">${item.count}</div><div style="width:${barWidth}px;height:${height}px;background:#4a7c59;border-radius:3px;margin:0 auto;"></div>`
      : `<div style="width:${barWidth}px;height:2px;background:#ddd;border-radius:1px;margin:0 auto;"></div>`;
    return `<td style="vertical-align:bottom;text-align:center;padding:0 4px;">${barHtml}<div style="font-size:11px;color:${item.count > 0 ? "#666" : "#888"};margin-top:6px;">${item.label}</div></td>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${cells}</tr></table>`;
}

const TH = "style=\"text-align:right;padding:6px 10px;color:#666;font-weight:600;\"";
const cell = (value, style = "") => `<td style="padding:6px 10px;text-align:right;${style}">${value}</td>`;

function statRow(label, values, {bold = false} = {}) {
  const rowStyle = bold ? "style=\"border-bottom:2px solid #e0e0e0;background:#f9faf9;\"" : "style=\"border-bottom:1px solid #f0f0f0;\"";
  const labelStyle = bold ? "color:#2f4f4f;font-weight:700;" : "color:#333;";
  const valueStyles = bold
    ? ["color:#2f4f4f;font-weight:700;", "color:#2f4f4f;font-weight:700;", "color:#2f4f4f;font-weight:700;"]
    : ["font-weight:600;", "", "color:#888;"];
  return `<tr ${rowStyle}><td style="padding:6px 10px;${labelStyle}">${label}</td>${values.map((value, index) => cell(value, valueStyles[index])).join("")}</tr>`;
}

/** 7-day / 30-day / All-time stats table for one teacher in one classroom. */
export function renderStatsTable(row, studentCount) {
  const windowValues = (field) => [fmt(row[`${field}7d`]), fmt(row[`${field}30d`]), fmt(row[field])];
  const rows = [
    statRow("Observations", windowValues("observations")),
    statRow("Lessons", windowValues("lessons")),
    statRow("Media", windowValues("media")),
    statRow("Assessments", windowValues("assessments")),
    statRow("Questions answered", windowValues("questionsAnswered")),
    statRow("Total notes", [fmt(totalNotes(row, "7d")), fmt(totalNotes(row, "30d")), fmt(totalNotes(row, ""))], {bold: true}),
    // X/Y holds meaning for bounded windows; the all-time denominator is
    // unstable as students join and leave, so it stays a plain count (#274).
    statRow("Children covered", [`${fmt(row.studentsReached7d)}/${fmt(studentCount)}`, `${fmt(row.studentsReached30d)}/${fmt(studentCount)}`, fmt(row.studentsReached)]),
  ];
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="border-bottom:2px solid #e0e0e0;"><th style="text-align:left;padding:6px 10px;color:#666;font-weight:600;"></th><th ${TH}>7 days</th><th ${TH}>30 days</th><th ${TH}>All time</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderChartBlock(series) {
  const total = series.reduce((sum, item) => sum + item.count, 0);
  return `<div style="text-align:center;margin:0 0 24px;">${renderBarChart(series)}<p style="margin:8px 0 0;font-size:12px;color:#999;">Total this week: ${fmt(total)} notes</p></div>`;
}

const footer = "<div style=\"border-top:1px solid #e0e0e0;padding-top:16px;text-align:center;font-size:12px;color:#999;\"><p style=\"margin:0;\">This is an automated weekly summary from Pep OS.</p></div>";

const wrap = (title, subtitle, body) => `<div style="max-width:600px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#222;"><h2 style="text-align:center;margin:0 0 4px;color:#2f4f4f;">${title}</h2><p style="text-align:center;margin:0 0 24px;color:#888;font-size:14px;">${subtitle}</p>${body}${footer}</div>`;

/** Weekly email for a single teacher. */
export function renderTeacherEmail({teacherName, weekLabel, series, sections}) {
  const sectionHtml = sections.map((section) => `<div style="margin-bottom:28px;"><h3 style="margin:0 0 12px;color:#2f4f4f;border-bottom:2px solid #4a7c59;padding-bottom:6px;font-size:16px;">${escapeHtml(section.classroomName)}</h3>${renderStatsTable(section.row, section.studentCount)}</div>`).join("");
  return wrap("Weekly Activity", `${escapeHtml(teacherName)} - ${escapeHtml(weekLabel)}`, renderChartBlock(series) + sectionHtml);
}

/**
 * Combined email for a classroomadmin: own activity box first (only when the
 * admin is on some classroom roster), then per-classroom teacher sections.
 */
export function renderAdminEmail({adminName, weekLabel, self, classrooms}) {
  const parts = [];
  if (self) {
    const selfSections = self.sections.map((section) => `<h4 style="margin:0 0 10px;color:#2f4f4f;border-bottom:2px solid #4a7c59;padding-bottom:4px;font-size:14px;">${escapeHtml(section.classroomName)}</h4>${renderStatsTable(section.row, section.studentCount)}<div style="margin-bottom:16px;"></div>`).join("");
    parts.push(`<div style="margin-bottom:32px;padding:16px;border:2px solid #4a7c59;border-radius:8px;background:#f9faf9;"><h3 style="margin:0 0 16px;color:#2f4f4f;font-size:16px;">Your activity</h3>${renderChartBlock(self.series)}${selfSections}</div>`);
  }
  for (const classroom of classrooms) {
    const teacherBlocks = classroom.teachers.map((teacher) => `<div style="margin-bottom:20px;"><h4 style="margin:0 0 10px;color:#333;font-size:14px;">${escapeHtml(teacher.name)}${teacher.isSelf ? " <span style=\"color:#888;font-size:12px;\">(you)</span>" : ""}</h4>${renderStatsTable(teacher.row, classroom.studentCount)}</div>`).join("");
    parts.push(`<div style="margin-bottom:28px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;"><h3 style="margin:0 0 16px;color:#2f4f4f;border-bottom:2px solid #4a7c59;padding-bottom:6px;font-size:16px;">${escapeHtml(classroom.classroomName)} <span style="font-weight:400;font-size:13px;color:#888;">(${classroom.teachers.length} teachers, ${classroom.studentCount} students)</span></h3>${teacherBlocks}</div>`);
  }
  return wrap("Weekly Teacher Stats", `${escapeHtml(adminName)} - ${escapeHtml(weekLabel)}`, parts.join(""));
}

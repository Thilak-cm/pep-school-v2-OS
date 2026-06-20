/**
 * Test Bench: Report generation with caller-supplied prompt (PEP-328).
 *
 * Fetches student data and observations for a date range,
 * then calls the LLM via OpenRouter to generate a parent report.
 */
import { db } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import {
  getStudentWithProgram,
  formatObservationForPrompt,
  chooseObservationTimestamp,
} from "../shared/studentHelpers.js";
import { assembleReportSystemContent } from "../utils/reportHelpers.js";

const REPORT_JSON_WRAPPER = `

IMPORTANT: You must output your response as a JSON object with exactly this structure:
{
  "reportText": "<the full report narrative as a single string, using \\n for line breaks and ## for section headers>"
}

The reportText should contain the complete parent-facing report following the prompt instructions above.
Output ONLY the JSON object, nothing else.`;

/**
 * Build the user message for the report LLM call.
 * Exported for testing.
 */
export function buildReportUserMessage({ studentContext, notes, dateRange, reportType }) {
  const safeContext = {
    studentName: studentContext?.studentName || "Unknown student",
    dob: studentContext?.dob || "dob unavailable in context",
    age: studentContext?.age || "age unavailable",
  };

  const label = reportType === "monthly" ? "Monthly Baseline Report" : "Educator Summary";

  return [
    `Generate the ${label} for the period ${dateRange.start} to ${dateRange.end}.`,
    "",
    `Student: ${JSON.stringify(safeContext)}`,
    "",
    `Notes (${notes.length} observations, JSON array):`,
    JSON.stringify(notes),
  ].join("\n");
}

/**
 * Parse the LLM response — extract reportText from JSON, or return raw if not JSON.
 * Exported for testing.
 */
export function parseReportOutput(rawContent) {
  try {
    const parsed = JSON.parse(rawContent);
    return typeof parsed.reportText === "string" ? parsed.reportText : rawContent;
  } catch {
    return rawContent;
  }
}

/**
 * Fetch observations for a student within a date range.
 * Copied from reports/index.js — testbench must not import from production CFs.
 */
async function fetchStudentNotesForDateRange(studentId, startDate, endDate) {
  const notesMap = new Map();
  const studentObsRef = db.collection("students").doc(studentId).collection("observations");

  const collect = async (field) => {
    try {
      const snap = await studentObsRef
        .where(field, ">=", startDate)
        .where(field, "<=", endDate)
        .get();
      snap.docs.forEach((d) => {
        notesMap.set(d.id, { id: d.id, ...d.data() });
      });
    } catch (err) {
      console.warn(`[testBenchReport] query failed for field ${field}:`, err);
    }
  };

  await collect("observedAt");
  await collect("createdAt");
  await collect("timestamp");

  const notes = Array.from(notesMap.values()).filter((n) => {
    const ts = chooseObservationTimestamp(n);
    return ts && ts >= startDate && ts <= endDate;
  });

  notes.sort((a, b) => {
    const ta = chooseObservationTimestamp(a);
    const tb = chooseObservationTimestamp(b);
    return (ta?.getTime() || 0) - (tb?.getTime() || 0);
  });

  return notes;
}

/**
 * Main test bench handler for report generation.
 */
export async function testBenchReport({
  studentId,
  reportType = "term",
  dateRangeStart,
  dateRangeEnd,
  systemPrompt,
  model,
  temperature,
  maxTokens,
  apiKey,
}) {
  // Fetch student info
  const studentInfo = await getStudentWithProgram(studentId);

  // Determine date range
  const now = new Date();
  let startDate, endDate;

  if (dateRangeStart) {
    startDate = new Date(dateRangeStart);
  } else if (reportType === "monthly") {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
  } else {
    const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
    startDate = new Date(year, 10, 1);
  }
  endDate = dateRangeEnd ? new Date(dateRangeEnd) : now;

  // Fetch observations
  const notes = await fetchStudentNotesForDateRange(studentId, startDate, endDate);
  const formatted = notes.map(formatObservationForPrompt);

  // Build prompt
  const fullSystemPrompt = assembleReportSystemContent(
    systemPrompt,
    "",
    REPORT_JSON_WRAPPER,
  );

  const userMessage = buildReportUserMessage({
    studentContext: studentInfo,
    notes: formatted,
    dateRange: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
    reportType,
  });

  // Call OpenRouter
  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
  });

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  const totalTokens = data.usage?.total_tokens || 0;
  const reportText = parseReportOutput(rawContent);

  return {
    output: reportText,
    totalTokens,
    noteCount: formatted.length,
    programId: studentInfo.programId || null,
  };
}

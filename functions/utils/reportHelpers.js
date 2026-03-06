import { REPORT_PROMPT_DOCS, REPORT_DEFAULTS } from "../config/reportConstants.js";

/**
 * Returns the default date range for report generation.
 * Academic year starts Nov 1, so:
 * - If current month is Nov or later → start = Nov 1 of current year
 * - If current month is before Nov  → start = Nov 1 of previous year
 * End is always "now".
 */
export function getDefaultDateRange(now = new Date()) {
  const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 10, 1); // Nov 1
  return { start, end: now };
}

/**
 * Returns the academic year string for a given date.
 * Academic year starts in November (REPORT_DEFAULTS.defaultStartMonth).
 * March 2026 → "2025-26", December 2026 → "2026-27"
 */
export function getAcademicYear(date = new Date()) {
  const startYear = date.getMonth() >= REPORT_DEFAULTS.defaultStartMonth
    ? date.getFullYear()
    : date.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/**
 * Parse the structured JSON response from GPT-4o report generation.
 * Expected shape: { reportText, sentimentScore, areaBalanceScore, missingInputFlags }
 */
export function parseReportResponse(rawContent) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("Failed to parse report response as JSON");
  }

  const reportText = typeof parsed.reportText === "string" ? parsed.reportText.trim() : "";
  if (!reportText) {
    throw new Error("reportText is missing or empty in AI response");
  }

  const sentimentScore = clampScore(parsed.sentimentScore);
  const areaBalanceScore = clampScore(parsed.areaBalanceScore);
  const missingInputFlags = Array.isArray(parsed.missingInputFlags)
    ? parsed.missingInputFlags.filter((f) => typeof f === "string")
    : [];

  return { reportText, sentimentScore, areaBalanceScore, missingInputFlags };
}

/**
 * Check whether a value is a valid ISO-8601 date string.
 * Returns false for non-strings and strings that produce Invalid Date.
 */
function isValidIsoDate(value) {
  if (typeof value !== "string" || !value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

/**
 * Clamp a score to 1-5 range, or return null if not a valid number.
 */
function clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * Validate and sanitize a client-supplied report payload for Firestore persistence.
 * Throws if required fields are missing or malformed.
 * Returns a sanitized copy with clamped scores and typed fields.
 */
export function validateReportPayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("reportPayload must be an object");
  }
  if (typeof raw.reportText !== "string" || !raw.reportText.trim()) {
    throw new Error("reportPayload.reportText is required");
  }

  const ALLOWED_STATUSES = ["ok", "no_notes"];
  const status = ALLOWED_STATUSES.includes(raw.status) ? raw.status : "ok";

  const noteCount = Number.isFinite(raw.noteCount) && raw.noteCount >= 0
    ? Math.floor(raw.noteCount) : 0;

  const sentimentScore = clampScoreExported(raw.sentimentScore);
  const areaBalanceScore = clampScoreExported(raw.areaBalanceScore);

  const missingInputFlags = Array.isArray(raw.missingInputFlags)
    ? raw.missingInputFlags.filter((f) => typeof f === "string")
    : [];

  const sourceNoteIds = Array.isArray(raw.sourceNoteIds)
    ? raw.sourceNoteIds.filter((id) => typeof id === "string")
    : [];

  const programId = typeof raw.programId === "string" ? raw.programId : "";
  const model = typeof raw.model === "string" ? raw.model : "gpt-4o";

  return {
    reportText: raw.reportText.trim(),
    status,
    noteCount,
    sentimentScore,
    areaBalanceScore,
    missingInputFlags,
    sourceNoteIds,
    programId,
    model,
    generatedAt: isValidIsoDate(raw.generatedAt) ? raw.generatedAt : null,
    dateRangeStart: isValidIsoDate(raw.dateRangeStart) ? raw.dateRangeStart : null,
    dateRangeEnd: isValidIsoDate(raw.dateRangeEnd) ? raw.dateRangeEnd : null,
  };
}

/**
 * Clamp a score to 1-5 range, or return null if not a valid number.
 * Exported version of the internal clampScore for reuse.
 */
export function clampScoreExported(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * Get the Firestore document ID for a program's report prompt.
 * Returns null if the program is not supported.
 */
export function getReportPromptDocId(programId) {
  if (!programId || typeof programId !== "string") return null;
  return REPORT_PROMPT_DOCS[programId] || null;
}

/**
 * Merge a Firestore config doc's data with REPORT_DEFAULTS.
 * Returns only the known config keys (model, temperature, max_tokens, timezone).
 */
export function mergeReportConfig(docData, defaults = REPORT_DEFAULTS) {
  const d = docData || {};
  return {
    model: d.model || defaults.model,
    temperature: Number.isFinite(d.temperature) ? d.temperature : defaults.temperature,
    max_tokens: Number.isFinite(d.max_tokens) ? d.max_tokens : defaults.max_tokens,
    timezone: d.timezone || defaults.timezone,
  };
}

/**
 * Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsvField(value) {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

/**
 * Format a single CSV row for the summary CSV.
 * Columns: Child Name, Branch, Program, Classroom, Generation Date,
 *          Sentiment Score, Area Balance Score, Missing Input Flags, Google Doc Link
 */
export function formatCsvRow({
  studentName, branch, program, classroom,
  generatedAt, sentimentScore, areaBalanceScore, missingInputFlags, docLink,
}) {
  const flags = Array.isArray(missingInputFlags) ? missingInputFlags.join("; ") : "";
  return [
    escapeCsvField(studentName),
    escapeCsvField(branch || ""),
    escapeCsvField(program || ""),
    escapeCsvField(classroom || ""),
    escapeCsvField(generatedAt),
    sentimentScore != null ? String(sentimentScore) : "",
    areaBalanceScore != null ? String(areaBalanceScore) : "",
    escapeCsvField(flags),
    escapeCsvField(docLink),
  ].join(",");
}

/**
 * Parse CSV content into headers and rows.
 * Handles quoted fields containing commas.
 */
export function parseCsv(content) {
  if (!content || !content.trim()) return { headers: [], rows: [] };

  const lines = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "\"") {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const fields = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\"") {
        if (quoted && line[i + 1] === "\"") {
          field += "\"";
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === "," && !quoted) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(parseLine);

  return { headers, rows };
}

/**
 * Serialize headers and rows back to CSV string.
 */
export function serializeCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

/**
 * Remove a student's row from CSV content by name.
 * Returns the updated CSV string, or empty string if input is empty.
 */
export function removeCsvRow(existingCsv, studentName, csvHeaders) {
  if (!existingCsv || !existingCsv.trim()) return "";

  const { headers, rows } = parseCsv(existingCsv);
  const nameColIdx = headers.findIndex((h) =>
    h.trim().toLowerCase() === "child name",
  );

  if (nameColIdx < 0) return existingCsv;

  const filtered = rows.filter((r) =>
    r[nameColIdx]?.trim().toLowerCase() !== studentName.trim().toLowerCase(),
  );

  return serializeCsv(headers.length ? headers : csvHeaders, filtered);
}

/**
 * Update CSV content: replace existing row for studentName, or append new row.
 * If existing CSV is empty, creates new CSV with headers.
 */
export function updateCsvContent(existingCsv, newRow, studentName, csvHeaders) {
  if (!existingCsv || !existingCsv.trim()) {
    return csvHeaders.join(",") + "\n" + newRow;
  }

  const { headers, rows } = parseCsv(existingCsv);
  const nameColIdx = headers.findIndex((h) =>
    h.trim().toLowerCase() === "child name",
  );

  const newFields = parseCsv(csvHeaders.join(",") + "\n" + newRow).rows[0];

  if (nameColIdx >= 0) {
    const existingIdx = rows.findIndex((r) =>
      r[nameColIdx]?.trim().toLowerCase() === studentName.trim().toLowerCase(),
    );
    if (existingIdx >= 0) {
      rows[existingIdx] = newFields;
    } else {
      rows.push(newFields);
    }
  } else {
    rows.push(newFields);
  }

  return serializeCsv(headers.length ? headers : csvHeaders, rows);
}

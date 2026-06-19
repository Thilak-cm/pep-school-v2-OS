import { REPORT_PROMPT_DOCS, REPORT_BASELINE_PROMPT_DOCS, REPORT_DEFAULTS, READINESS_PROMPT_DOCS } from "../config/reportConstants.js";

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
 * Parse the structured JSON response from GPT-4o report generation.
 * Expected shape: { reportText }
 * Scoring (sentimentScore, areaBalanceScore, missingInputFlags) is handled
 * separately by the report readiness checker (PEP-68).
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

  return { reportText };
}

/**
 * Clamp a score to 1-5 range, or return null if not a valid number.
 * Used by the report readiness checker (PEP-68).
 */
export function clampScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

/**
 * Parse the JSON response from the readiness evaluator LLM call (PEP-68).
 * Expected shape: { sentimentScore, areaBalanceScore, missingInputFlags }
 */
export function parseReadinessResponse(rawContent) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("Failed to parse readiness response as JSON");
  }

  const sentimentScore = clampScore(parsed.sentimentScore);
  const areaBalanceScore = clampScore(parsed.areaBalanceScore);
  const missingInputFlags = Array.isArray(parsed.missingInputFlags)
    ? parsed.missingInputFlags.filter((f) => typeof f === "string")
    : [];

  return { sentimentScore, areaBalanceScore, missingInputFlags };
}

/**
 * Get the Firestore document ID for a program's report prompt.
 * Term reports (default) resolve to REPORT_PROMPT_DOCS; baseline reports (PEP-325)
 * resolve to the dedicated REPORT_BASELINE_PROMPT_DOCS. There is no cross-fallback:
 * a baseline request never resolves a term doc (and vice versa).
 * Returns null if the program is not supported.
 */
export function getReportPromptDocId(programId, reportType = "term") {
  if (!programId || typeof programId !== "string") return null;
  const docs = reportType === "baseline" ? REPORT_BASELINE_PROMPT_DOCS : REPORT_PROMPT_DOCS;
  return docs[programId] || null;
}

/**
 * Get the Firestore document ID for a program's readiness evaluator prompt.
 * Returns null if the program is not supported.
 */
export function getReadinessPromptDocId(programId) {
  if (!programId || typeof programId !== "string") return null;
  return READINESS_PROMPT_DOCS[programId] || null;
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
 * Assemble the full system message content for report generation.
 * Joins static system prompt + dynamic system prompt (if non-empty) + JSON wrapper.
 * When dynamicSystemPrompt is empty/null, the output is identical to the
 * pre-split behavior (staticSystemPrompt + jsonWrapper).
 */
export function assembleReportSystemContent(staticSP, dynamicSP, jsonWrapper) {
  const staticTrimmed = (staticSP || "").trimEnd();
  const dynamicTrimmed = (dynamicSP || "").trim();
  const promptParts = [staticTrimmed, dynamicTrimmed].filter(Boolean).join("\n\n");
  return promptParts + (jsonWrapper || "");
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
 * Columns: Child Name, Branch, Program, Classroom, Generation Date, Author,
 *          Sentiment Score, Area Balance Score, Missing Input Flags, Google Doc Link
 */
export function formatCsvRow({
  studentName, branch, program, classroom,
  generatedAt, author, sentimentScore, areaBalanceScore, missingInputFlags, docLink,
}) {
  const flags = Array.isArray(missingInputFlags) ? missingInputFlags.join("; ") : "";
  return [
    escapeCsvField(studentName),
    escapeCsvField(branch || ""),
    escapeCsvField(program || ""),
    escapeCsvField(classroom || ""),
    escapeCsvField(generatedAt),
    escapeCsvField(author || ""),
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
 * Migrate existing rows when CSV headers have changed (e.g. new column added).
 * Maps old columns to new positions by header name; new columns get empty values.
 */
function migrateRows(oldHeaders, newHeaders, rows) {
  const mapping = oldHeaders.map((h) => {
    const needle = h.trim().toLowerCase();
    return newHeaders.findIndex((nh) => nh.trim().toLowerCase() === needle);
  });
  return rows.map((row) => {
    const out = new Array(newHeaders.length).fill("");
    for (let i = 0; i < oldHeaders.length; i++) {
      if (mapping[i] >= 0 && i < row.length) out[mapping[i]] = row[i];
    }
    return out;
  });
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

  let { headers, rows } = parseCsv(existingCsv);

  // Migrate existing rows if headers have changed (e.g. new column added)
  if (headers.length && headers.length !== csvHeaders.length) {
    rows = migrateRows(headers, csvHeaders, rows);
    headers = csvHeaders;
  }

  const useHeaders = headers.length ? headers : csvHeaders;
  const nameColIdx = useHeaders.findIndex((h) =>
    h.trim().toLowerCase() === "child name",
  );

  if (nameColIdx < 0) return existingCsv;

  const filtered = rows.filter((r) =>
    r[nameColIdx]?.trim().toLowerCase() !== studentName.trim().toLowerCase(),
  );

  return serializeCsv(useHeaders, filtered);
}

/**
 * Set a Date's time to 23:59:59.999 (end of day) so that
 * an end-date filter is inclusive of the entire day.
 * Returns a new Date — does not mutate the original.
 */
export function normalizeEndOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Append a row to CSV content — always adds, never replaces.
 * Used by the archive CSV to accumulate historical rows.
 * If existing CSV is empty, creates new CSV with headers.
 */
export function appendCsvContent(existingCsv, newRow, csvHeaders) {
  if (!existingCsv || !existingCsv.trim()) {
    return csvHeaders.join(",") + "\n" + newRow;
  }

  let { headers, rows } = parseCsv(existingCsv);

  // Migrate existing rows if headers have changed (e.g. new column added)
  if (headers.length && headers.length !== csvHeaders.length) {
    rows = migrateRows(headers, csvHeaders, rows);
    headers = csvHeaders;
  }

  const newFields = parseCsv(csvHeaders.join(",") + "\n" + newRow).rows[0];
  rows.push(newFields);
  return serializeCsv(headers.length ? headers : csvHeaders, rows);
}


/**
 * Update CSV content: replace existing row for studentName, or append new row.
 * If existing CSV is empty, creates new CSV with headers.
 */
export function updateCsvContent(existingCsv, newRow, studentName, csvHeaders) {
  if (!existingCsv || !existingCsv.trim()) {
    return csvHeaders.join(",") + "\n" + newRow;
  }

  let { headers, rows } = parseCsv(existingCsv);

  // Migrate existing rows if headers have changed (e.g. new column added)
  if (headers.length && headers.length !== csvHeaders.length) {
    rows = migrateRows(headers, csvHeaders, rows);
    headers = csvHeaders;
  }

  const useHeaders = headers.length ? headers : csvHeaders;
  const nameColIdx = useHeaders.findIndex((h) =>
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

  return serializeCsv(useHeaders, rows);
}

/**
 * Build an archive snapshot of a report_readiness doc before overwrite.
 * Returns null if the doc should not be archived (no_notes, missing, etc.).
 *
 * @param {Object|null|undefined} existingData - Previous readiness doc data
 * @param {string} reason - Why this archive was created
 * @returns {Object|null} Archive document fields, or null to skip archival
 */
export function buildReadinessArchive(existingData, reason) {
  if (!existingData || existingData.status !== "ok") return null;
  return {
    ...existingData,
    archivedAt: new Date(),
    reason,
  };
}

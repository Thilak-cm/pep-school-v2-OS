/**
 * Deterministic parser for structured assessment workbooks.
 *
 * Values remain strings by design: no units, scores, durations, or rubrics
 * are inferred during ingestion.
 */

const REQUIRED_METADATA = new Set(["assessment name", "assessment description", "date"]);

function clean(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function key(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function resultNumber(label) {
  const match = key(label).match(/^result\s+(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseDateValue(value) {
  const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

function parseDateRange(value) {
  const parts = clean(value).split(/\s*(?:-|–|—|to)\s*/i);
  if (parts.length === 1) {
    const date = parseDateValue(parts[0]);
    return date ? {startDate: date, endDate: date} : null;
  }
  if (parts.length !== 2) return null;
  const startDate = parseDateValue(parts[0]);
  const endDate = parseDateValue(parts[1]);
  if (!startDate || !endDate || startDate > endDate) return null;
  return {startDate, endDate};
}

/** Parse a matrix produced by XLSX.utils.sheet_to_json({header: 1, raw: false}). */
export function parseAssessmentMatrix(matrix, options = {}) {
  const errors = [];
  const rows = Array.isArray(matrix) ? matrix : [];
  const metadata = {};
  let separatorIndex = -1;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const first = clean(row[0]);
    const second = clean(row[1]);
    if (!first && !second) {
      if (Object.keys(metadata).length) {
        separatorIndex = index;
        break;
      }
      continue;
    }
    const resultNo = resultNumber(first);
    if (second && (REQUIRED_METADATA.has(key(first)) || resultNo !== null)) {
      const normalized = key(first);
      if (metadata[normalized] !== undefined) {
        errors.push({code: "INVALID_METADATA", message: `Metadata field “${first}” appears more than once.`, row: index + 1});
      } else {
        metadata[normalized] = second;
      }
    }
  }

  if (separatorIndex < 0) {
    errors.push({code: "MISSING_DATA_TABLE", message: "Add a blank row between the metadata and student result table."});
    return {metadata, resultDefinitions: [], rows: [], errors};
  }
  for (const field of REQUIRED_METADATA) {
    if (!metadata[field]) errors.push({code: "INVALID_METADATA", message: `Required metadata field “${field}” is missing.`});
  }

  const resultDefinitions = Object.entries(metadata)
    .map(([label, description]) => {
      const number = resultNumber(label);
      return number === null ? null : {number, label: `Result ${number}`, description};
    }).filter(Boolean).sort((a, b) => a.number - b.number);
  resultDefinitions.forEach((definition, index) => {
    if (definition.number !== index + 1) errors.push({code: "INVALID_METADATA", message: "Result definitions must be contiguous starting at Result 1."});
  });
  if (!resultDefinitions.length) errors.push({code: "INVALID_METADATA", message: "At least one Result definition is required."});

  const dateRange = parseDateRange(metadata.date);
  if (!dateRange) errors.push({code: "INVALID_METADATA", message: "Date must be DD/MM/YYYY or a valid DD/MM/YYYY date range."});

  // Teachers often leave more than one visual spacer row between the
  // metadata block and the data table. Skip only the consecutive blank rows
  // immediately after metadata; blank rows inside the student table remain
  // available for normal row handling below.
  let headerIndex = separatorIndex + 1;
  while (headerIndex < rows.length && (rows[headerIndex] || []).every((value) => !clean(value))) {
    headerIndex += 1;
  }
  const header = (rows[headerIndex] || []).map(clean);
  const expected = ["name", ...resultDefinitions.map((definition) => key(definition.label))];
  const headerKeys = header.map(key).filter(Boolean);
  const expectedSet = new Set(expected);
  if (headerKeys.length !== expected.length || headerKeys.some((value) => !expectedSet.has(value)) || new Set(headerKeys).size !== headerKeys.length) {
    errors.push({code: "INVALID_DATA_HEADER", message: `The data table must contain Name and exactly ${resultDefinitions.length} declared Result column(s).`, row: headerIndex + 1});
  }

  const columnIndexes = new Map(header.map((value, index) => [key(value), index]));

  const parsedRows = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const name = clean(row[columnIndexes.get("name") ?? 0]);
    const values = resultDefinitions.map((definition) => String(row[columnIndexes.get(key(definition.label))] ?? ""));
    if (!name && values.every((value) => !clean(value))) continue;
    if (!name) {
      errors.push({code: "MISSING_STUDENT_NAME", message: "Every populated row needs a student Name.", row: index + 1});
      continue;
    }
    if (values.every((value) => !clean(value))) {
      errors.push({code: "MISSING_RESULT", message: `Student “${name}” has no result values.`, row: index + 1});
      continue;
    }
    const segments = values.map((value) => value.split("\n"));
    const counts = segments.map((parts) => parts.filter((part) => clean(part) !== "").length).filter((count) => count > 0);
    const segmentCount = counts[0] || 1;
    if (counts.some((count) => count !== segmentCount)) {
      errors.push({code: "MULTILINE_MISMATCH", message: `Result lines for “${name}” must have the same number of nonblank segments.`, row: index + 1});
      continue;
    }
    for (let segment = 0; segment < segmentCount; segment += 1) {
      parsedRows.push({sourceRow: index + 1, segment: segment + 1, name, values: Object.fromEntries(resultDefinitions.map((definition, resultIndex) => [definition.label, segments[resultIndex][segment] ?? ""]))});
    }
  }

  if (parsedRows.length > 450) {
    errors.push({code: "RECORD_LIMIT", message: "This upload creates more than the 450-record limit. Split the workbook and try again."});
  }

  return {metadata: {...metadata, assessmentName: metadata["assessment name"], assessmentDescription: metadata["assessment description"], dateRange, ...options}, resultDefinitions, rows: parsedRows, errors};
}

export function normalizeFilename(filename) {
  return clean(filename).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildStructuredAssessmentId(sourceId, sourceRow, segment) {
  return `assessment_structured_${sourceId}_${sourceRow}_${segment}`;
}

/**
 * Deterministic parser for structured assessment workbooks.
 *
 * Values remain strings by design: no units, scores, durations, or rubrics
 * are inferred during ingestion. Cell provenance is retained for server-side
 * validation and future source audits, but is not intended for UI display.
 */

const REQUIRED_METADATA = new Set(["assessment name", "assessment description", "date"]);
const MAX_RECORDS = 450;

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

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function normalizeCell(cell, rowIndex, columnIndex) {
  if (cell && typeof cell === "object" && cell.__assessmentCell === true) {
    return cell;
  }
  return {
    __assessmentCell: true,
    displayValue: String(cell ?? ""),
    sourceCell: `${columnName(columnIndex)}${rowIndex + 1}`,
    sourceRow: rowIndex + 1,
    sourceColumn: columnIndex + 1,
    formula: null,
    hasCachedValue: true,
  };
}

function displayValue(cell, rowIndex, columnIndex) {
  return normalizeCell(cell, rowIndex, columnIndex).displayValue;
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

function missingFormulaCacheError(cell, row) {
  return {
    code: "FORMULA_CACHE_MISSING",
    message: `Formula cell ${cell.sourceCell} has no cached displayed result. Recalculate and save the workbook, then upload it again.`,
    row,
    cell: cell.sourceCell,
  };
}

/**
 * Convert a SheetJS worksheet to the provenance-aware matrix consumed by the
 * parser. The SheetJS module is injected so this file stays portable between
 * the Vite client and the Node Cloud Functions runtime.
 *
 * @param {Object} worksheet SheetJS worksheet
 * @param {Object} xlsx SheetJS module
 * @returns {Array<Array<Object>>}
 */
export function worksheetToAssessmentMatrix(worksheet, xlsx) {
  if (!worksheet || !worksheet["!ref"] || !xlsx?.utils) return [];
  const range = xlsx.utils.decode_range(worksheet["!ref"]);
  const matrix = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const sourceCell = xlsx.utils.encode_cell({r: rowIndex, c: columnIndex});
      const source = worksheet[sourceCell];
      const formula = typeof source?.f === "string" ? source.f : null;
      const hasCachedValue = !formula || (Object.prototype.hasOwnProperty.call(source, "v") && source.v !== undefined && source.v !== null);
      let formatted = "";
      if (source && hasCachedValue) {
        formatted = source.w !== undefined ? String(source.w) : String(xlsx.utils.format_cell(source) ?? "");
      }
      row.push({
        __assessmentCell: true,
        displayValue: formatted,
        sourceCell,
        sourceRow: rowIndex + 1,
        sourceColumn: columnIndex + 1,
        formula,
        hasCachedValue,
      });
    }
    matrix.push(row);
  }
  return matrix;
}

/** Parse a plain or provenance-aware worksheet matrix. */
export function parseAssessmentMatrix(matrix, options = {}) {
  const errors = [];
  const rows = Array.isArray(matrix) ? matrix : [];
  const metadata = {};
  const metadataOccurrences = new Map();
  let separatorIndex = -1;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const firstCell = normalizeCell(row[0], index, 0);
    const secondCell = normalizeCell(row[1], index, 1);
    const first = clean(firstCell.displayValue);
    const second = clean(secondCell.displayValue);
    if (!first && !second) {
      if (metadataOccurrences.size) {
        separatorIndex = index;
        break;
      }
      continue;
    }
    const resultNo = resultNumber(first);
    const normalized = key(first);
    if (REQUIRED_METADATA.has(normalized) || resultNo !== null) {
      const count = (metadataOccurrences.get(normalized) || 0) + 1;
      metadataOccurrences.set(normalized, count);
      if (count > 1) {
        errors.push({code: "INVALID_METADATA", message: `Metadata field “${first}” appears more than once.`, row: firstCell.sourceRow, cell: firstCell.sourceCell});
      } else {
        metadata[normalized] = second;
      }
      if (resultNo !== null && !second) {
        errors.push({
          code: "INVALID_METADATA",
          message: `${first || `Result ${resultNo}`} needs a definition in ${secondCell.sourceCell}. Add a description for what this result means.`,
          row: secondCell.sourceRow,
          cell: secondCell.sourceCell,
        });
      }
      if (secondCell.formula && !secondCell.hasCachedValue) {
        errors.push(missingFormulaCacheError(secondCell, secondCell.sourceRow));
      }
    }
  }

  if (separatorIndex < 0) {
    errors.push({code: "MISSING_DATA_TABLE", message: "Add a blank row between the metadata and student result table."});
    return {metadata, resultDefinitions: [], rows: [], errors};
  }
  for (const field of REQUIRED_METADATA) {
    if (!metadataOccurrences.has(field)) {
      errors.push({code: "INVALID_METADATA", message: `Required metadata field “${field}” is missing.`});
    } else if (!metadata[field]) {
      errors.push({code: "INVALID_METADATA", message: `Required metadata field “${field}” needs a value.`});
    }
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

  // Multiple visual spacer rows are accepted only between metadata and header.
  let headerIndex = separatorIndex + 1;
  while (headerIndex < rows.length && (rows[headerIndex] || []).every((value, columnIndex) => !clean(displayValue(value, headerIndex, columnIndex)))) {
    headerIndex += 1;
  }
  const headerCells = (rows[headerIndex] || []).map((value, columnIndex) => normalizeCell(value, headerIndex, columnIndex));
  const header = headerCells.map((cell) => clean(cell.displayValue));
  const expected = ["name", ...resultDefinitions.map((definition) => key(definition.label))];
  const headerKeys = header.map(key).filter(Boolean);
  const expectedSet = new Set(expected);
  if (headerKeys.length !== expected.length || headerKeys.some((value) => !expectedSet.has(value)) || new Set(headerKeys).size !== headerKeys.length) {
    errors.push({code: "INVALID_DATA_HEADER", message: `The data table must contain Name and exactly ${resultDefinitions.length} declared Result column(s).`, row: headerCells[0]?.sourceRow || headerIndex + 1});
  }

  const columnIndexes = new Map(header.map((value, index) => [key(value), index]));
  const parsedRows = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const nameColumn = columnIndexes.get("name") ?? 0;
    const nameCell = normalizeCell(row[nameColumn], index, nameColumn);
    const name = clean(nameCell.displayValue);
    const resultCells = resultDefinitions.map((definition) => {
      const columnIndex = columnIndexes.get(key(definition.label));
      return normalizeCell(row[columnIndex], index, columnIndex);
    });
    const sourceValues = resultCells.map((cell) => cell.displayValue);
    if (!name && sourceValues.every((value) => !clean(value))) continue;
    if (nameCell.formula && !nameCell.hasCachedValue) {
      errors.push(missingFormulaCacheError(nameCell, nameCell.sourceRow));
    }
    resultCells.forEach((cell) => {
      if (cell.formula && !cell.hasCachedValue) {
        errors.push(missingFormulaCacheError(cell, cell.sourceRow));
      }
    });
    if (!name) {
      errors.push({code: "MISSING_STUDENT_NAME", message: "Every populated row needs a student Name.", row: nameCell.sourceRow, cell: nameCell.sourceCell});
      continue;
    }
    if (sourceValues.every((value) => !clean(value))) {
      errors.push({code: "MISSING_RESULT", message: `Student “${name}” has no result values.`, row: nameCell.sourceRow});
      continue;
    }

    // Blank lines inside a nonblank cell are meaningful alignment segments.
    // Entirely blank Result cells are padded to the segment count established
    // by the nonblank cells in that row.
    const segmented = sourceValues.map((value) => clean(value) ? String(value).split(/\r?\n/) : null);
    const counts = segmented.filter(Boolean).map((parts) => parts.length);
    const segmentCount = counts[0] || 1;
    if (counts.some((count) => count !== segmentCount)) {
      errors.push({code: "MULTILINE_MISMATCH", message: `Result lines for “${name}” must have the same number of segments, including blank lines.`, row: nameCell.sourceRow});
      continue;
    }

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const results = resultDefinitions.map((definition, resultIndex) => {
        const cell = resultCells[resultIndex];
        return {
          resultNumber: definition.number,
          label: definition.description,
          sourceValue: segmented[resultIndex]?.[segment] ?? "",
          sourceCell: cell.sourceCell,
          sourceFormula: cell.formula,
        };
      });
      parsedRows.push({
        sourceRow: nameCell.sourceRow,
        segment: segment + 1,
        segmentCount,
        name,
        nameSourceCell: nameCell.sourceCell,
        values: Object.fromEntries(results.map((result) => [`Result ${result.resultNumber}`, result.sourceValue])),
        results,
      });
    }
  }

  if (parsedRows.length > MAX_RECORDS) {
    errors.push({code: "RECORD_LIMIT", message: "This upload creates more than the 450-record limit. Split the workbook and try again."});
  }

  return {
    metadata: {
      ...metadata,
      assessmentName: metadata["assessment name"],
      assessmentDescription: metadata["assessment description"],
      dateRange,
      ...options,
    },
    resultDefinitions,
    rows: parsedRows,
    errors,
  };
}

export function normalizeFilename(filename) {
  return clean(filename).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildStructuredAssessmentId(sourceId, sourceRow, segment) {
  return `assessment_structured_${sourceId}_${sourceRow}_${segment}`;
}

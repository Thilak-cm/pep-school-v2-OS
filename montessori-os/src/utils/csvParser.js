import Papa from 'papaparse';

export const DEFAULT_PLACEHOLDER_DATE = '2026-01-10';

const VALID_TYPES = ['lesson', 'observation'];
const REQUIRED_HEADERS = ['type', 'student_name', 'date', 'content'];

/**
 * Parse a CSV string into rows.
 * @param {string} csvText - raw CSV text
 * @returns {{ rows: object[], errors: string[] }}
 */
export function parseCSV(csvText) {
  if (!csvText || !csvText.trim()) {
    return { rows: [], errors: ['CSV is empty'] };
  }

  const result = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (value) => value.trim(),
  });

  const errors = result.errors
    .filter((e) => e.type !== 'FieldMismatch')
    .map((e) => `Row ${e.row + 1}: ${e.message}`);

  return { rows: result.data, errors };
}

/**
 * Validate parsed CSV rows for required fields and valid types.
 * @param {object[]} rows - parsed rows
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCSV(rows) {
  const errors = [];

  if (rows.length === 0) {
    return { valid: false, errors: ['No data rows found'] };
  }

  const headers = Object.keys(rows[0]);
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) {
      errors.push(`Missing required column: "${h}"`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  rows.forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed, skip header
    if (!row.type || !VALID_TYPES.includes(row.type.toLowerCase())) {
      errors.push(`Row ${rowNum}: invalid type "${row.type}" (must be "lesson" or "observation")`);
    }
    if (!row.student_name || !row.student_name.trim()) {
      errors.push(`Row ${rowNum}: missing student_name`);
    }
    if (!row.content || !row.content.trim()) {
      errors.push(`Row ${rowNum}: missing content`);
    }
    // date is optional — will be filled by applyDefaultDate
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Extract unique student names from parsed rows (case-insensitive dedup).
 * Preserves the casing of the first occurrence.
 * @param {object[]} rows - parsed rows with student_name field
 * @returns {string[]}
 */
export function extractUniqueNames(rows) {
  const seen = new Map();
  for (const row of rows) {
    const name = row.student_name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, name);
    }
  }
  return Array.from(seen.values());
}

/**
 * Convert a DD-MM-YYYY date string to YYYY-MM-DD.
 * Returns the input unchanged if it doesn't match DD-MM-YYYY.
 * @param {string} dateStr
 * @returns {string}
 */
export function normalizeDateDMY(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return dateStr;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Fill missing dates with the default placeholder date and normalize DD-MM-YYYY to ISO.
 * Returns a new array (does not mutate input).
 * @param {object[]} rows - parsed rows
 * @returns {object[]}
 */
export function applyDefaultDate(rows) {
  return rows.map((row) => {
    if (!row.date || !row.date.trim()) {
      return { ...row, date: DEFAULT_PLACEHOLDER_DATE };
    }
    return { ...row, date: normalizeDateDMY(row.date) };
  });
}

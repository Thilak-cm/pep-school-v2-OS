/**
 * Pure helpers for parsing and validating two-step photo analysis responses (PEP-131).
 * Call 1 (classification): parseClassification — handwritten, curriculumArea, description
 * Call 2 (handwriting analysis): parseHandwritingAnalysis — developmentalNotes + 5 dimensions
 * No Firebase dependencies — safe to import in tests.
 */

export const WRITING_DIMENSIONS = ['handwriting', 'spelling', 'vocabulary', 'structure', 'punctuation'];

export const CLASSIFICATION_DEFAULTS = Object.freeze({
  handwritten: false,
  curriculumArea: null,
  description: null,
});

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function tryParse(input) {
  if (!input) return null;
  if (typeof input === 'object') return input;
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return null; }
  }
  return null;
}

function parseDimension(dim) {
  if (!dim || typeof dim !== 'object') return { rating: null, note: null };
  const r = dim.rating;
  const rating = typeof r === 'number' && Number.isInteger(r) && r >= 1 && r <= 5 ? r : null;
  const note = typeof dim.note === 'string' ? dim.note : null;
  return { rating, note };
}

/* ------------------------------------------------------------------ */
/*  parseClassification  (Call 1 — gpt-5.4-nano)                      */
/* ------------------------------------------------------------------ */

/**
 * Parse and validate a classification response from Call 1.
 * Accepts a JSON string or pre-parsed object.
 * Returns { handwritten, curriculumArea, description }.
 */
export function parseClassification(input) {
  const parsed = tryParse(input);
  if (!parsed) return { ...CLASSIFICATION_DEFAULTS };

  const handwritten = parsed.handwritten === true;
  const curriculumArea = typeof parsed.curriculumArea === 'string' && parsed.curriculumArea
    ? parsed.curriculumArea : null;
  const description = typeof parsed.description === 'string' && parsed.description
    ? parsed.description : null;

  return { handwritten, curriculumArea, description };
}

/* ------------------------------------------------------------------ */
/*  parseHandwritingAnalysis  (Call 2 — gpt-5.4)                      */
/* ------------------------------------------------------------------ */

/**
 * Parse and validate a handwriting analysis response from Call 2.
 * Accepts a JSON string or pre-parsed object.
 * Returns { developmentalNotes, handwriting, spelling, vocabulary, structure, punctuation }
 * or null if input is empty/invalid.
 */
export function parseHandwritingAnalysis(input) {
  const parsed = tryParse(input);
  if (!parsed) return null;

  const developmentalNotes = typeof parsed.developmentalNotes === 'string'
    ? parsed.developmentalNotes : null;

  const result = { developmentalNotes };
  for (const dim of WRITING_DIMENSIONS) {
    result[dim] = parseDimension(parsed[dim]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  buildMediaFields — combines classification + analysis             */
/* ------------------------------------------------------------------ */

/**
 * Combine parsed classification and analysis into flat media doc fields.
 * Returns { handwritten, curriculumArea, description, handwritingAnalysis }.
 */
export function buildMediaFields(classification, analysis) {
  const cls = classification || CLASSIFICATION_DEFAULTS;
  return {
    handwritten: cls.handwritten === true,
    curriculumArea: cls.curriculumArea || null,
    description: cls.description || null,
    handwritingAnalysis: cls.handwritten === true ? (analysis || null) : null,
  };
}

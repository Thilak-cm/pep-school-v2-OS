/**
 * Pure helpers for parsing and validating VLM photo analysis responses (PEP-32).
 * No Firebase dependencies — safe to import in tests.
 */

const VALID_CATEGORIES = new Set(['student_work', 'other']);

const WRITING_DIMENSIONS = ['handwriting', 'spelling', 'vocabulary', 'structure', 'punctuation'];

export const PHOTO_ANALYSIS_DEFAULTS = Object.freeze({
  handwritten: false,
  contentCategory: 'other',
  description: null,
  materialsIdentified: [],
  curriculumArea: null,
  curriculumSubArea: null,
  developmentalNotes: null,
  writingAnalysis: null,
  teacherEdited: false,
});

function parseDimension(dim) {
  if (!dim || typeof dim !== 'object') return { rating: null, note: null };
  const rating = typeof dim.rating === 'number' && dim.rating >= 1 && dim.rating <= 5
    ? dim.rating : null;
  const note = typeof dim.note === 'string' ? dim.note : null;
  return { rating, note };
}

function parseWritingAnalysis(wa) {
  if (!wa || typeof wa !== 'object') return null;
  const result = {};
  for (const dim of WRITING_DIMENSIONS) {
    result[dim] = parseDimension(wa[dim]);
  }
  return result;
}

/**
 * Parse and validate a VLM photo analysis response.
 * Accepts a JSON string or an already-parsed object.
 * Returns a validated object with defaults for missing/invalid fields.
 */
export function parsePhotoAnalysis(input) {
  if (!input) return { ...PHOTO_ANALYSIS_DEFAULTS };

  let parsed;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ...PHOTO_ANALYSIS_DEFAULTS };
    }
  } else if (typeof input === 'object') {
    parsed = input;
  } else {
    return { ...PHOTO_ANALYSIS_DEFAULTS };
  }

  const handwritten = parsed.handwritten === true;
  const contentCategory = VALID_CATEGORIES.has(parsed.contentCategory)
    ? parsed.contentCategory : 'other';

  const description = typeof parsed.description === 'string' ? parsed.description : null;
  const materialsIdentified = Array.isArray(parsed.materialsIdentified)
    ? parsed.materialsIdentified.filter((m) => typeof m === 'string') : [];
  const curriculumArea = typeof parsed.curriculumArea === 'string' ? parsed.curriculumArea : null;
  const curriculumSubArea = typeof parsed.curriculumSubArea === 'string' ? parsed.curriculumSubArea : null;
  const developmentalNotes = typeof parsed.developmentalNotes === 'string' ? parsed.developmentalNotes : null;

  // Only include writingAnalysis when handwritten is true
  const writingAnalysis = handwritten ? parseWritingAnalysis(parsed.writingAnalysis) : null;

  return {
    handwritten,
    contentCategory,
    description,
    materialsIdentified,
    curriculumArea,
    curriculumSubArea,
    developmentalNotes,
    writingAnalysis,
    teacherEdited: parsed?.teacherEdited === true,
  };
}

/**
 * Pure helpers for parsing photo classification responses (PEP-131 → PEP-146).
 * Call 1 (classification): parseClassification — handwritten, curriculumArea
 * Call 2 (handwriting analysis) removed in PEP-146 — deferred to PEP-132 batch analysis.
 * No Firebase dependencies — safe to import in tests.
 */

export const CLASSIFICATION_DEFAULTS = Object.freeze({
  handwritten: false,
  curriculumArea: null,
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

/* ------------------------------------------------------------------ */
/*  parseClassification  (Call 1 — gpt-5.4-nano)                      */
/* ------------------------------------------------------------------ */

/**
 * Parse and validate a classification response from Call 1.
 * Accepts a JSON string or pre-parsed object.
 * Returns { handwritten, curriculumArea }.
 */
export function parseClassification(input) {
  const parsed = tryParse(input);
  if (!parsed) return { ...CLASSIFICATION_DEFAULTS };

  const handwritten = parsed.handwritten === true;
  const curriculumArea = typeof parsed.curriculumArea === 'string' && parsed.curriculumArea
    ? parsed.curriculumArea : null;

  return { handwritten, curriculumArea };
}

/* ------------------------------------------------------------------ */
/*  buildMediaFields — classification only (PEP-146)                  */
/* ------------------------------------------------------------------ */

/**
 * Convert parsed classification into flat media doc fields.
 * Returns { handwritten, curriculumArea }.
 */
export function buildMediaFields(classification) {
  const cls = classification || CLASSIFICATION_DEFAULTS;
  return {
    handwritten: cls.handwritten === true,
    curriculumArea: cls.curriculumArea || null,
  };
}

/* ------------------------------------------------------------------ */
/*  mapVLMResultsToMediaItems — per-photo result mapping (PEP-146)    */
/* ------------------------------------------------------------------ */

/**
 * Map per-photo VLM results (from CF) back to media items by itemId.
 * Returns a new array with classification fields merged onto matching items.
 *
 * @param {Array|null} results - CF response `results` array: [{ itemId, handwritten, curriculumArea }]
 * @param {Array} mediaItems - Current media items array (each has `.id`)
 * @returns {Array} New media items array with classification fields merged
 */
export function mapVLMResultsToMediaItems(results, mediaItems) {
  if (!Array.isArray(results) || results.length === 0) {
    return [...mediaItems];
  }

  const resultMap = new Map();
  for (const r of results) {
    if (r && r.itemId) {
      resultMap.set(r.itemId, r);
    }
  }

  return mediaItems.map((item) => {
    const r = resultMap.get(item.id);
    if (!r) return item;
    const fields = buildMediaFields(parseClassification(r));
    return { ...item, ...fields, analyzed: true };
  });
}

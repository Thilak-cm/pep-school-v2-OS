/**
 * Text sanitization for the Google Docs API. Single source of truth -
 * every pipeline that writes to the Docs API imports from here. Do not
 * reimplement the regex locally: a second copy is how the reports path
 * stayed unprotected for weeks after the monthly-plan fix.
 *
 * Strips control chars that the Docs API silently discards on insertText
 * (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F, U+007F; tab/newline/CR kept).
 *
 * Why this exists: batchUpdate indices are client-side predictions of
 * server-side state. If the server drops a char we counted, every subsequent
 * index drifts and the whole batch fails ("Index N must be less than the end
 * index of the referenced segment"). Seen in prod when an LLM emitted U+001A
 * in plan `work` fields (student 2026-GUL-007, Sept 2026).
 *
 * Rule for consumers: sanitize BEFORE any length counting / range
 * arithmetic - ideally once, at the top of the request builder - so the
 * counted text and the inserted text can never disagree.
 */

/**
 * @param {string} s - Raw text (possibly null/undefined).
 * @return {string} Sanitized text safe for insertText requests.
 */
// eslint-disable-next-line no-control-regex -- matching control chars is the entire purpose here
export const sanitizeForGDocsApi = (s) => (s || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

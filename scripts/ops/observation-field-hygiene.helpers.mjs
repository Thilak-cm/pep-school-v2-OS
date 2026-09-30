/**
 * Pure helpers for scripts/ops/observation-field-hygiene.mjs (#294).
 * Kept side-effect free so the census/classification logic is unit-testable
 * without Firestore.
 */

/**
 * Fields approved for deletion from ALL observation docs (#294):
 * - attendanceStatus: hardcoded 'present' at every write site since inception;
 *   the absent-marking feature it anticipated was never built.
 * - branchId: partial denorm - only bulk-upload and assessment docs carried
 *   it, app-created notes never did, and no reader used it. Branch is derived
 *   via student -> classroom -> branch (source of truth: classroom doc).
 * isRootObservation is deliberately NOT listed: zero code references exist;
 * it joins this list only if the census proves live docs carry it.
 */
export const DEAD_FIELDS = ["attendanceStatus", "branchId"];

/**
 * Fields we count but do not delete: suspected docs-phantoms or legacy field
 * names that readers still carry fallbacks for. Census evidence feeds #295.
 */
export const WATCH_FIELDS = [
  "isRootObservation",
  "title",
  "description",
  "dimensionRatings",
  "teacherName",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Classify an observation doc ID into its generation-site shape.
 * The uuid_fallback buckets answer #227's open question: do offline-queue
 * fallback IDs (`obs_${item.id}` where item.id is a UUID) exist in prod?
 * @param {string} id
 * @returns {string} shape bucket
 */
export function classifyDocId(id) {
  if (typeof id !== "string" || id.length === 0) return "other";
  if (id.startsWith("sa_")) return "structured_assessment";
  if (id.startsWith("assessment_medical_")) return "medical_assessment";
  for (const prefix of ["obs", "lesson"]) {
    if (id.startsWith(`${prefix}_bulk_`)) return `${prefix}_bulk`;
    if (id.startsWith(`${prefix}_`)) {
      const rest = id.slice(prefix.length + 1);
      if (UUID_RE.test(rest)) return `${prefix}_uuid_fallback`;
      // Standard app shape: `{prefix}_{ts36}_{rand}_{sid4}` -> 3 segments.
      const parts = rest.split("_");
      if (parts.length === 3 && parts.every((p) => p.length > 0)) {
        return `${prefix}_standard`;
      }
      return "other";
    }
  }
  return "other";
}

/** @returns {{total: number, idShapes: object, typeCounts: object, fieldCensus: object}} */
export function createCensus() {
  return { total: 0, idShapes: {}, typeCounts: {}, fieldCensus: {} };
}

const bump = (obj, key) => {
  obj[key] = (obj[key] || 0) + 1;
};

/**
 * Record one observation doc into the census accumulator.
 * @param {object} census from createCensus()
 * @param {{id: string, type: string|undefined, fieldNames: string[]}} doc
 */
export function recordDoc(census, { id, type, fieldNames }) {
  census.total += 1;
  bump(census.idShapes, classifyDocId(id));
  const typeKey = type || "(missing)";
  bump(census.typeCounts, typeKey);
  if (!census.fieldCensus[typeKey]) census.fieldCensus[typeKey] = {};
  for (const field of fieldNames) {
    bump(census.fieldCensus[typeKey], field);
  }
}

/**
 * Which dead fields does this doc actually carry?
 * @param {object} data doc data
 * @param {string[]} deadFields
 * @returns {string[]}
 */
export function fieldsToDelete(data, deadFields) {
  return deadFields.filter((field) => field in data);
}

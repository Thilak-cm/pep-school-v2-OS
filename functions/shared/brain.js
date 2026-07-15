/**
 * Brain knowledge base reader (#157).
 *
 * Single entry point for LLM pipelines to load their context from the
 * Firestore `brain` collection (synced from the repo's brain/ folder via
 * `npm run push-brain`).
 *
 * DESIGN DECISIONS (issue #157 "Decisions Made"):
 * - ONE full-subcollection query per program (~30-40 small docs), with the
 *   four layers assembled in memory. This needs zero composite indexes,
 *   costs one round-trip instead of four, and lets every pipeline in a
 *   program share a single cache entry. (Decision 11)
 * - Per-program Map cache with 5-min TTL, matching the established pattern
 *   in functions/ai/baseballCard.js. Pass { forceRefresh: true } to bypass.
 * - `toddler` programId resolves to the `primary` folder. (Decision 8)
 * - Plain Error (not HttpsError) — this is a shared utility, not a
 *   callable; callers wrap errors as needed (same as coach.js).
 *
 * Usage:
 *   import { readBrain } from "../shared/brain.js";
 *   const { config, prompt, knowledge } = await readBrain("primary", "coach", "teacher-facing");
 */

import { db } from "./firebase.js";
import {
  resolveProgramFolder,
  isSchoolWideOnly,
  assembleBrainContext,
} from "./brain.helpers.mjs";

const BRAIN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const brainCache = new Map(); // programFolder -> { docs, ts }

const SCHOOL_WIDE = "school-wide";

/**
 * Loads the assembled brain context for a pipeline.
 *
 * @param {string} programId - live programId (toddler/primary/elementary/adolescent)
 * @param {string} pipeline - pipeline folder name (e.g. "coach", "term-report")
 * @param {"teacher-facing"|"parent-facing"|null} audience - pipeline's audience
 * @param {{forceRefresh?: boolean}} [options]
 * @returns {Promise<{config: object|null, prompt: string|null, knowledge: string}>}
 */
export async function readBrain(programId, pipeline, audience = null, { forceRefresh = false } = {}) {
  const schoolWideDocs = await fetchProgramDocs(SCHOOL_WIDE, forceRefresh);

  // Horizontal tools (text-summarizer, voice-transcriber) live in
  // school-wide and never read program/audience layers.
  if (isSchoolWideOnly(pipeline)) {
    return assembleBrainContext(schoolWideDocs, schoolWideDocs, { pipeline, audience: null });
  }

  const programFolder = resolveProgramFolder(programId);
  const programDocs = await fetchProgramDocs(programFolder, forceRefresh);
  return assembleBrainContext(schoolWideDocs, programDocs, { pipeline, audience });
}

/** Clears the cache — exported for tests and admin tooling. */
export function clearBrainCache() {
  brainCache.clear();
}

async function fetchProgramDocs(programFolder, forceRefresh) {
  const cached = brainCache.get(programFolder);
  const fresh = !forceRefresh && cached && Date.now() - cached.ts < BRAIN_CACHE_TTL_MS;
  if (fresh) return cached.docs;

  const snap = await db.collection("brain").doc(programFolder).collection("files").get();
  const docs = snap.docs.map((d) => d.data());
  brainCache.set(programFolder, { docs, ts: Date.now() });
  return docs;
}

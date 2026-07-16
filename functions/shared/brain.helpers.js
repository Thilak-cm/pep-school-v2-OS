/**
 * Pure helpers for the brain knowledge base reader (#157).
 *
 * Firebase-free by design so they can be unit tested directly
 * (node --test functions/test/brainHelpers.test.mjs). The Firestore
 * fetch + cache layer lives in ./brain.js.
 */

// Toddler is a 1-year feeder into the 3-year primary program — they share
// one brain folder (Rahul, Jul 13 meeting). `toddler` is a live programId
// across the codebase (term_report_toddler, readiness_toddler, ...), so
// without this normalization any pipeline called with a toddler student
// would silently read an empty brain/toddler collection.
const PROGRAM_FOLDER_MAP = {
  toddler: "primary",
  primary: "primary",
  elementary: "elementary",
  adolescent: "adolescent",
};

// Horizontal, context-free tools — they read only school-wide content,
// never program/audience knowledge (spec decision, confirmed with Rahul).
const SCHOOL_WIDE_ONLY_PIPELINES = new Set(["text-summarizer", "voice-transcriber"]);

// Blank line between knowledge segments for LLM readability.
const KNOWLEDGE_SEPARATOR = "\n\n";

/** Maps a live programId to its brain folder (toddler -> primary). */
export function resolveProgramFolder(programId) {
  const folder = PROGRAM_FOLDER_MAP[programId];
  if (!folder) {
    throw new Error(
      `Unknown programId "${programId}" — expected one of: ${Object.keys(PROGRAM_FOLDER_MAP).join(", ")}`,
    );
  }
  return folder;
}

/** True for horizontal pipelines that only read school-wide content. */
export function isSchoolWideOnly(pipeline) {
  return SCHOOL_WIDE_ONLY_PIPELINES.has(pipeline);
}

/**
 * Assembles the four-layer brain context from pre-fetched docs.
 *
 * Layers (in order):
 *   1. school-wide knowledge  (type=knowledge, pipeline=null)
 *   2. program knowledge      (type=knowledge, pipeline=null, audience=null)
 *   3. audience knowledge     (type=knowledge, pipeline=null, audience=X)
 *   4. pipeline content       (pipeline=X: config + prompt + knowledge)
 *
 * Within each layer, docs are sorted alphabetically by filename so the
 * assembled context is deterministic and reproducible across runs.
 *
 * When schoolWideDocs and programDocs are the same collection (school-wide
 * -only pipelines), layers 2-3 are skipped to avoid duplicating content.
 *
 * @returns {{config: object|null, prompt: string|null, knowledge: string}}
 */
export function assembleBrainContext(schoolWideDocs, programDocs, { pipeline, audience }) {
  const sameCollection = schoolWideDocs === programDocs;

  const layer1 = knowledgeDocs(schoolWideDocs).filter((d) => d.pipeline === null);
  const layer2 = sameCollection
    ? []
    : knowledgeDocs(programDocs).filter((d) => d.pipeline === null && d.audience === null);
  const layer3 = sameCollection
    ? []
    : knowledgeDocs(programDocs).filter((d) => d.pipeline === null && d.audience === audience && audience !== null);

  const pipelineDocs = programDocs.filter((d) => d.pipeline === pipeline);
  const layer4 = pipelineDocs.filter((d) => d.type === "knowledge");

  const configDoc = pipelineDocs.find((d) => d.type === "config") ?? null;
  const promptDoc = pipelineDocs.find((d) => d.type === "prompt") ?? null;

  const knowledge = [layer1, layer2, layer3, layer4]
    .map((layer) => sortByFilename(layer).map((d) => d.content))
    .flat()
    .join(KNOWLEDGE_SEPARATOR);

  return {
    config: configDoc ? (configDoc.config ?? null) : null,
    prompt: promptDoc ? promptDoc.content : null,
    knowledge,
  };
}

function knowledgeDocs(docs) {
  return docs.filter((d) => d.type === "knowledge");
}

function sortByFilename(docs) {
  return [...docs].sort((a, b) => a.filename.localeCompare(b.filename));
}

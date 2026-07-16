/**
 * Pure helpers for the push-brain sync script (#157).
 *
 * DESIGN DECISIONS (from spec session, see issue #157 "Decisions Made"):
 * - These functions are deliberately Firebase-free so they can be unit
 *   tested directly (node --test) without Admin SDK init side effects.
 * - Doc IDs flatten the folder path with "--" separators because Firestore
 *   doc IDs cannot contain "/". Rahul never sees these IDs — he works with
 *   the local folder tree; the sync script owns the mapping.
 * - SHA-256 (not MD5) for checksums: same one-line implementation cost,
 *   stronger algorithm, no reason to start weaker.
 * - Checksums are computed over raw file bytes so unchanged files can be
 *   skipped without downloading their Firestore content.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const AUDIENCES = ["teacher-facing", "parent-facing"];
export const ALLOWED_EXTENSIONS = [".md", ".json"];

// Files that live in brain/ but are NOT knowledge content — never synced.
const EXCLUDED_FILENAMES = new Set(["BRAIN_RULES.md"]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

/**
 * Recursively walks the brain folder and returns content files.
 * Skips hidden files/folders (dotfiles — covers .DS_Store and
 * .brain-manifest.json) and BRAIN_RULES.md.
 * Returns posix-style relative paths for cross-platform stability.
 */
export function walkBrainFolder(rootPath) {
  const results = [];
  walk(rootPath);
  return results;

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue; // hidden files + manifest + .DS_Store
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (EXCLUDED_FILENAMES.has(name)) continue;
      const relativePath = relative(rootPath, fullPath).split(sep).join("/");
      results.push({ relativePath, filename: name, fullPath });
    }
  }
}

/**
 * Recursively walks the brain folder and returns all directory paths
 * (not files). Skips hidden directories (dotfiles). Returns sorted
 * posix-style relative paths for structural-change detection.
 *
 * Detects empty directories that contain no content files (unlike
 * deriving folders from walked file paths, which misses them).
 */
export function walkBrainDirectories(rootPath) {
  const results = [];
  walk(rootPath);
  return results.sort();

  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) {
        const rel = relative(rootPath, fullPath).split(sep).join("/");
        results.push(rel);
        walk(fullPath);
      }
    }
  }
}

/** Reads a walked file's content as UTF-8. */
export function readFileContent(fullPath) {
  return readFileSync(fullPath, "utf8");
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Parses a brain-relative path into its structural identity.
 *
 * Valid shapes:
 *   {program}/{file}                          -> program-level knowledge
 *   {program}/{pipeline}/{file}               -> school-wide pipeline files
 *   {program}/{audience}/{file}               -> audience-level knowledge
 *   {program}/{audience}/{pipeline}/{file}    -> pipeline files
 *
 * Type rules: config.json -> "config", prompt.md -> "prompt",
 * any other .md -> "knowledge".
 */
export function classifyFile(relativePath) {
  const segments = relativePath.split("/");
  if (segments.length < 2 || segments.length > 4) {
    throw new Error(`Unexpected path depth: ${relativePath}`);
  }

  const filename = segments[segments.length - 1];
  const program = segments[0];
  let audience = null;
  let pipeline = null;

  if (segments.length === 3) {
    // Either {program}/{audience}/{file} or {program}/{pipeline}/{file}
    if (AUDIENCES.includes(segments[1])) {
      audience = segments[1];
    } else {
      pipeline = segments[1];
    }
  } else if (segments.length === 4) {
    if (!AUDIENCES.includes(segments[1])) {
      throw new Error(
        `Expected audience folder at ${relativePath} — got "${segments[1]}"`,
      );
    }
    audience = segments[1];
    pipeline = segments[2];
  }

  const basename = filename.replace(/\.[^.]+$/, "");
  let type;
  if (filename === "config.json") type = "config";
  else if (filename === "prompt.md") type = "prompt";
  else type = "knowledge";

  return { program, audience, pipeline, type, filename, basename };
}

// ---------------------------------------------------------------------------
// Checksums & doc construction
// ---------------------------------------------------------------------------

export function computeChecksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Firestore doc ID from classified file. "--" replaces "/" since doc IDs
 * cannot contain slashes. Program is the parent doc, so it is excluded.
 */
export function buildDocId(classified) {
  const parts = [];
  if (classified.audience) parts.push(classified.audience);
  if (classified.pipeline) parts.push(classified.pipeline);
  parts.push(classified.basename);
  return parts.join("--");
}

/**
 * Full Firestore doc payload for a file. Config docs carry BOTH the raw
 * string (for checksums/diffs) and the parsed `config` object (what the
 * Cloud Function reader consumes). `updatedAt` is added by the script at
 * write time (server timestamp) — not here, to keep this pure.
 */
export function buildFileDoc(classified, relativePath, content) {
  const doc = {
    content,
    type: classified.type,
    pipeline: classified.pipeline,
    audience: classified.audience,
    filename: classified.filename,
    path: relativePath,
    checksum: computeChecksum(content),
  };
  if (classified.type === "config") {
    doc.config = parseConfigJson(content, relativePath);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Structural change detection
// ---------------------------------------------------------------------------

/**
 * Compares the current folder tree against the manifest's expected tree.
 * A rename surfaces as one added + one removed entry.
 */
export function detectStructuralChanges(currentFolders, manifestFolders) {
  const current = new Set(currentFolders);
  const manifest = new Set(manifestFolders);
  return {
    added: [...current].filter((f) => !manifest.has(f)).sort(),
    removed: [...manifest].filter((f) => !current.has(f)).sort(),
  };
}

// ---------------------------------------------------------------------------
// Diff classification
// ---------------------------------------------------------------------------

/**
 * Classifies every file as new / changed / deleted / unchanged by comparing
 * local checksums against remote (Firestore) checksums, keyed by path.
 * `deleted` = docs in Firestore with no local counterpart.
 */
export function diffStates(localFiles, remoteDocs) {
  const remoteByPath = new Map(remoteDocs.map((d) => [d.path, d]));
  const localPaths = new Set(localFiles.map((f) => f.path));

  const result = { new: [], changed: [], deleted: [], unchanged: [] };
  for (const file of localFiles) {
    const remote = remoteByPath.get(file.path);
    if (!remote) result.new.push(file);
    else if (remote.checksum !== file.checksum) result.changed.push(file);
    else result.unchanged.push(file);
  }
  for (const doc of remoteDocs) {
    if (!localPaths.has(doc.path)) result.deleted.push(doc);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates the walked tree. Every error blocks the push:
 * - unsupported extensions (only .md / .json allowed)
 * - pipeline folders missing config.json or prompt.md
 * - blank .md files
 * - duplicate basenames within a folder (docId collision)
 * - config.json that fails to parse or lacks `model`
 * - empty program or pipeline folders (when directories provided)
 *
 * @param {Array<{relativePath: string, content: string}>} entries
 * @param {Object} [options]
 * @param {string[]} [options.directories] - sorted posix-style directory paths from walkBrainDirectories
 * @returns {Array<{path: string, message: string}>}
 */
export function validateBrainTree(entries, { directories } = {}) {
  const errors = [];
  const byFolder = new Map(); // folder -> [{ filename, basename, content }]

  for (const { relativePath, content } of entries) {
    const segments = relativePath.split("/");
    const filename = segments[segments.length - 1];
    const folder = segments.slice(0, -1).join("/");
    const ext = filename.slice(filename.lastIndexOf("."));

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push({
        path: relativePath,
        message: `Unsupported extension "${ext}" — only .md and .json files are synced`,
      });
      continue;
    }

    const basename = filename.replace(/\.[^.]+$/, "");
    if (basename.includes("--")) {
      errors.push({
        path: relativePath,
        message: `Basename "${basename}" contains "--" which is reserved as the Firestore doc ID separator — rename the file`,
      });
    }

    if (ext === ".md" && content.trim() === "") {
      errors.push({ path: relativePath, message: "Blank .md file — add content or delete it" });
    }

    if (filename === "config.json") {
      try {
        parseConfigJson(content, relativePath);
      } catch (err) {
        errors.push({ path: relativePath, message: err.message });
      }
    }

    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push({
      filename,
      basename: filename.replace(/\.[^.]+$/, ""),
    });
  }

  for (const [folder, files] of byFolder) {
    // Duplicate basenames collide to the same Firestore doc ID.
    const seen = new Map();
    for (const f of files) {
      if (seen.has(f.basename)) {
        errors.push({
          path: `${folder}/${f.filename}`,
          message: `Duplicate basename "${f.basename}" in ${folder} — collides with ${seen.get(f.basename)}`,
        });
      } else {
        seen.set(f.basename, f.filename);
      }
    }

    // A folder is a pipeline folder if it contains config.json or prompt.md
    // (or sits at pipeline depth). Both fixed files are required.
    const names = new Set(files.map((f) => f.filename));
    const isPipelineFolder = names.has("config.json") || names.has("prompt.md");
    if (isPipelineFolder) {
      if (!names.has("config.json")) {
        errors.push({ path: folder, message: `Pipeline folder missing config.json` });
      }
      if (!names.has("prompt.md")) {
        errors.push({ path: folder, message: `Pipeline folder missing prompt.md` });
      }
    }
  }

  // Cross-folder docId uniqueness check per program. Two files in different
  // folders can map to the same Firestore doc ID (e.g. audience-level file
  // "notes.md" under teacher-facing/ vs pipeline file with matching segments).
  const byProgram = new Map(); // program -> Map<docId, relativePath>
  for (const { relativePath } of entries) {
    try {
      const classified = classifyFile(relativePath);
      const docId = buildDocId(classified);
      const { program } = classified;
      if (!byProgram.has(program)) byProgram.set(program, new Map());
      const programMap = byProgram.get(program);
      if (programMap.has(docId)) {
        errors.push({
          path: relativePath,
          message: `Doc ID collision "${docId}" in program "${program}" — collides with ${programMap.get(docId)}`,
        });
      } else {
        programMap.set(docId, relativePath);
      }
    } catch {
      // classifyFile errors are already caught during the classify phase
    }
  }

  // Empty folder checks — a program or pipeline directory on disk with zero
  // classified files would leave stale Firestore parent metadata and escape
  // the config.json+prompt.md requirement. Only runs when directories are
  // provided (the caller passes walkBrainDirectories output).
  if (directories) {
    // Set of folders that contain at least one file.
    const foldersWithFiles = new Set();
    for (const { relativePath } of entries) {
      const segments = relativePath.split("/");
      // Add every ancestor folder (e.g. "primary", "primary/teacher-facing", ...)
      for (let i = 1; i < segments.length; i++) {
        foldersWithFiles.add(segments.slice(0, i).join("/"));
      }
    }

    for (const dir of directories) {
      const segments = dir.split("/");

      // Depth 1: program folder (e.g. "primary")
      if (segments.length === 1) {
        if (!foldersWithFiles.has(dir)) {
          errors.push({
            path: dir,
            message: `${dir} contains no files — a program folder cannot be pushed empty. Delete the folder itself (structural change) or restore its files.`,
          });
        }
        continue;
      }

      // Depth 2: either an audience folder (skip) or a pipeline folder (school-wide pipelines)
      if (segments.length === 2) {
        if (AUDIENCES.includes(segments[1])) continue; // audience folder, not a pipeline
        // Non-audience depth-2 dir = pipeline folder
        if (!foldersWithFiles.has(dir)) {
          errors.push({
            path: dir,
            message: `Pipeline folder ${dir} contains no files — add config.json + prompt.md or delete the folder.`,
          });
        }
        continue;
      }

      // Depth 3: pipeline folder under audience (e.g. "primary/teacher-facing/coach")
      if (segments.length === 3 && AUDIENCES.includes(segments[1])) {
        if (!foldersWithFiles.has(dir)) {
          errors.push({
            path: dir,
            message: `Pipeline folder ${dir} contains no files — add config.json + prompt.md or delete the folder.`,
          });
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Parent metadata
// ---------------------------------------------------------------------------

// Toddler is a 1-year feeder into the 3-year primary program — one folder,
// same knowledge (Rahul, Jul 13 meeting). Reader-side normalization lives in
// functions/shared/brain.helpers.js (resolveProgramFolder).
const INCLUDES_PROGRAMS = {
  primary: ["toddler", "primary"],
};

const PROGRAM_DESCRIPTIONS = {
  "school-wide": "Knowledge and pipelines that apply across all programs",
  primary: "Primary program (includes toddler feeder year)",
  elementary: "Elementary program",
  adolescent: "Adolescent program",
};

/**
 * Parent doc metadata for brain/{program}. `updatedAt` is added at write
 * time by the script. Identity comes from git config (no Firebase Auth
 * user exists under applicationDefault credentials — see issue #157
 * decision 12).
 */
export function buildParentMetadata(program, classifiedFiles, { name, email }) {
  const pipelineIds = [
    ...new Set(classifiedFiles.filter((c) => c.pipeline).map((c) => c.pipeline)),
  ].sort();
  return {
    name: program === "school-wide" ? "School-wide" : capitalize(program),
    description: PROGRAM_DESCRIPTIONS[program] ?? "",
    includesPrograms: INCLUDES_PROGRAMS[program] ?? [program],
    lastSyncedByName: name,
    lastSyncedByEmail: email,
    docCount: classifiedFiles.length,
    pipelineIds,
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

/**
 * Parses config.json content. Must be valid JSON and contain `model`.
 * Extra fields (windowDays, minSamples, ...) pass through untouched —
 * pipelines have bespoke params and the schema stays open.
 */
export function parseConfigJson(content, path) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${path}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON in ${path} — expected an object`);
  }
  if (typeof parsed.model !== "string" || parsed.model.length === 0) {
    throw new Error(`Config ${path} missing required "model" field`);
  }
  return parsed;
}

const PLACEHOLDER_MODEL = "placeholder-set-before-use";

/**
 * Returns entries whose config.json model is the placeholder value.
 * These are valid for pushing (initial workflow) but would fail at
 * LLM call time, so the sync script warns about them non-blockingly.
 *
 * @param {Array<{relativePath: string, content: string, classified: {type: string}}>} entries
 * @returns {Array<{relativePath: string}>}
 */
export function findPlaceholderModels(entries) {
  return entries.filter((e) => {
    if (e.classified.type !== "config") return false;
    try {
      const parsed = JSON.parse(e.content);
      return parsed.model === PLACEHOLDER_MODEL;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Line delta (summary display)
// ---------------------------------------------------------------------------

/**
 * Multiset line comparison — good enough for the +/- summary display.
 * Full diffs (the `d` option) shell out to `git diff --no-index` instead.
 */
export function countLineDelta(oldContent, newContent) {
  const oldCounts = lineCounts(oldContent);
  const newCounts = lineCounts(newContent);

  let added = 0;
  for (const [line, count] of newCounts) {
    added += Math.max(0, count - (oldCounts.get(line) ?? 0));
  }
  let removed = 0;
  for (const [line, count] of oldCounts) {
    removed += Math.max(0, count - (newCounts.get(line) ?? 0));
  }
  return { added, removed };
}

function lineCounts(content) {
  const counts = new Map();
  for (const line of content.split("\n")) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

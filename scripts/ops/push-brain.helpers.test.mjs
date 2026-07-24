/**
 * Tests for push-brain sync helpers (#157).
 *
 * These helpers are deliberately pure (no Firebase init side effects),
 * so they are imported directly — unlike older admin script tests that
 * inline logic to dodge Firebase initialization.
 *
 * Run with: node --test scripts/ops/push-brain.helpers.test.mjs
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  walkBrainFolder,
  walkBrainDirectories,
  classifyFile,
  computeChecksum,
  buildDocId,
  buildFileDoc,
  detectStructuralChanges,
  diffStates,
  validateBrainTree,
  buildParentMetadata,
  parseConfigJson,
  countLineDelta,
  findPlaceholderModels,
} from "./push-brain.helpers.mjs";

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

describe("classifyFile", () => {
  test("school-wide program-level knowledge", () => {
    const c = classifyFile("school-wide/nomenclature.md");
    assert.deepEqual(c, {
      program: "school-wide",
      audience: null,
      pipeline: null,
      type: "knowledge",
      filename: "nomenclature.md",
      basename: "nomenclature",
    });
  });

  test("school-wide pipeline config", () => {
    const c = classifyFile("school-wide/text-summarizer/config.json");
    assert.equal(c.program, "school-wide");
    assert.equal(c.audience, null);
    assert.equal(c.pipeline, "text-summarizer");
    assert.equal(c.type, "config");
  });

  test("program-level knowledge", () => {
    const c = classifyFile("primary/context.md");
    assert.equal(c.program, "primary");
    assert.equal(c.audience, null);
    assert.equal(c.pipeline, null);
    assert.equal(c.type, "knowledge");
  });

  test("audience-level knowledge", () => {
    const c = classifyFile("primary/teacher-facing/language-conventions.md");
    assert.equal(c.program, "primary");
    assert.equal(c.audience, "teacher-facing");
    assert.equal(c.pipeline, null);
    assert.equal(c.type, "knowledge");
  });

  test("pipeline prompt under audience", () => {
    const c = classifyFile("primary/teacher-facing/coach/prompt.md");
    assert.equal(c.audience, "teacher-facing");
    assert.equal(c.pipeline, "coach");
    assert.equal(c.type, "prompt");
  });

  test("pipeline config under parent-facing", () => {
    const c = classifyFile("primary/parent-facing/term-report/config.json");
    assert.equal(c.audience, "parent-facing");
    assert.equal(c.pipeline, "term-report");
    assert.equal(c.type, "config");
  });

  test("extra .md in pipeline folder is knowledge", () => {
    const c = classifyFile("primary/teacher-facing/coach/rubric.md");
    assert.equal(c.pipeline, "coach");
    assert.equal(c.type, "knowledge");
  });

  test("throws on unexpected nesting depth", () => {
    assert.throws(() => classifyFile("primary/teacher-facing/coach/sub/x.md"));
  });

  test("throws on file at brain root", () => {
    assert.throws(() => classifyFile("orphan.md"));
  });
});

// ---------------------------------------------------------------------------
// computeChecksum
// ---------------------------------------------------------------------------

describe("computeChecksum", () => {
  test("same content, same checksum", () => {
    assert.equal(computeChecksum("hello"), computeChecksum("hello"));
  });

  test("different content, different checksum", () => {
    assert.notEqual(computeChecksum("hello"), computeChecksum("hello "));
  });

  test("returns 64-char hex (SHA-256)", () => {
    assert.match(computeChecksum("x"), /^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// buildDocId
// ---------------------------------------------------------------------------

describe("buildDocId", () => {
  test("program-level knowledge: bare basename", () => {
    assert.equal(buildDocId(classifyFile("primary/nomenclature.md")), "nomenclature");
  });

  test("audience-level knowledge: audience--basename", () => {
    assert.equal(
      buildDocId(classifyFile("primary/teacher-facing/language-conventions.md")),
      "teacher-facing--language-conventions",
    );
  });

  test("pipeline file: audience--pipeline--basename", () => {
    assert.equal(
      buildDocId(classifyFile("primary/teacher-facing/coach/prompt.md")),
      "teacher-facing--coach--prompt",
    );
  });

  test("school-wide pipeline file: pipeline--basename (no audience)", () => {
    assert.equal(
      buildDocId(classifyFile("school-wide/voice-transcriber/config.json")),
      "voice-transcriber--config",
    );
  });
});

// ---------------------------------------------------------------------------
// buildFileDoc
// ---------------------------------------------------------------------------

describe("buildFileDoc", () => {
  test("knowledge doc shape", () => {
    const classified = classifyFile("primary/teacher-facing/coach/rubric.md");
    const doc = buildFileDoc(classified, "primary/teacher-facing/coach/rubric.md", "# Rubric");
    assert.equal(doc.content, "# Rubric");
    assert.equal(doc.type, "knowledge");
    assert.equal(doc.pipeline, "coach");
    assert.equal(doc.audience, "teacher-facing");
    assert.equal(doc.filename, "rubric.md");
    assert.equal(doc.path, "primary/teacher-facing/coach/rubric.md");
    assert.equal(doc.checksum, computeChecksum("# Rubric"));
    assert.equal("config" in doc, false);
  });

  test("config doc carries parsed config object plus raw content", () => {
    const raw = JSON.stringify({ model: "gpt-x", temperature: 0.4, windowDays: 7 });
    const classified = classifyFile("primary/teacher-facing/coach/config.json");
    const doc = buildFileDoc(classified, "primary/teacher-facing/coach/config.json", raw);
    assert.equal(doc.type, "config");
    assert.equal(doc.content, raw);
    assert.deepEqual(doc.config, { model: "gpt-x", temperature: 0.4, windowDays: 7 });
  });
});

// ---------------------------------------------------------------------------
// walkBrainFolder (real temp dir)
// ---------------------------------------------------------------------------

describe("walkBrainFolder", () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "brain-test-"));
    mkdirSync(join(root, "primary/teacher-facing/coach"), { recursive: true });
    writeFileSync(join(root, "BRAIN_RULES.md"), "rules");
    writeFileSync(join(root, ".brain-manifest.json"), "{}");
    writeFileSync(join(root, ".DS_Store"), "junk");
    writeFileSync(join(root, "primary/context.md"), "ctx");
    writeFileSync(join(root, "primary/.DS_Store"), "junk");
    writeFileSync(join(root, "primary/teacher-facing/coach/config.json"), "{}");
    writeFileSync(join(root, "primary/teacher-facing/coach/prompt.md"), "p");
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("collects content files, skips manifest/rules/hidden files", () => {
    const files = walkBrainFolder(root);
    const paths = files.map((f) => f.relativePath).sort();
    assert.deepEqual(paths, [
      "primary/context.md",
      "primary/teacher-facing/coach/config.json",
      "primary/teacher-facing/coach/prompt.md",
    ]);
  });

  test("returns posix-style relative paths regardless of platform", () => {
    const files = walkBrainFolder(root);
    for (const f of files) assert.equal(f.relativePath.includes("\\"), false);
  });
});

// ---------------------------------------------------------------------------
// walkBrainDirectories (real temp dir)
// ---------------------------------------------------------------------------

describe("walkBrainDirectories", () => {
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "brain-dirs-test-"));
    mkdirSync(join(root, "primary/teacher-facing/coach"), { recursive: true });
    mkdirSync(join(root, "primary/empty-pipeline"), { recursive: true });
    mkdirSync(join(root, ".hidden-dir"), { recursive: true });
    writeFileSync(join(root, "primary/context.md"), "ctx");
    writeFileSync(join(root, "primary/teacher-facing/coach/prompt.md"), "p");
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test("includes empty directories that have no files", () => {
    const dirs = walkBrainDirectories(root);
    assert.ok(dirs.includes("primary/empty-pipeline"), "empty dir should be visible");
  });

  test("skips hidden directories", () => {
    const dirs = walkBrainDirectories(root);
    assert.ok(!dirs.some((d) => d.includes(".hidden")), "hidden dirs should be skipped");
  });

  test("returns sorted posix-style paths", () => {
    const dirs = walkBrainDirectories(root);
    assert.deepEqual(dirs, [
      "primary",
      "primary/empty-pipeline",
      "primary/teacher-facing",
      "primary/teacher-facing/coach",
    ]);
  });
});

// ---------------------------------------------------------------------------
// detectStructuralChanges
// ---------------------------------------------------------------------------

describe("structural change detection", () => {
  const folders = [
    "primary",
    "primary/teacher-facing",
    "primary/teacher-facing/coach",
    "school-wide",
  ];

  test("no changes when trees match", () => {
    const changes = detectStructuralChanges(folders, folders);
    assert.deepEqual(changes, { added: [], removed: [] });
  });

  test("detects added folder", () => {
    const current = [...folders, "primary/teacher-facing/new-pipeline"];
    const changes = detectStructuralChanges(current, folders);
    assert.deepEqual(changes.added, ["primary/teacher-facing/new-pipeline"]);
    assert.deepEqual(changes.removed, []);
  });

  test("detects removed folder", () => {
    const current = folders.filter((f) => f !== "primary/teacher-facing/coach");
    const changes = detectStructuralChanges(current, folders);
    assert.deepEqual(changes.removed, ["primary/teacher-facing/coach"]);
  });
});

// ---------------------------------------------------------------------------
// diffStates
// ---------------------------------------------------------------------------

describe("diffStates", () => {
  const local = [
    { path: "primary/context.md", checksum: "aaa" },
    { path: "primary/teacher-facing/coach/prompt.md", checksum: "bbb" },
    { path: "primary/new-file.md", checksum: "ccc" },
  ];
  const remote = [
    { path: "primary/context.md", checksum: "aaa" },
    { path: "primary/teacher-facing/coach/prompt.md", checksum: "OLD" },
    { path: "primary/ghost.md", checksum: "ddd" },
  ];

  test("classifies new, changed, deleted, unchanged", () => {
    const diff = diffStates(local, remote);
    assert.deepEqual(diff.unchanged.map((f) => f.path), ["primary/context.md"]);
    assert.deepEqual(diff.changed.map((f) => f.path), ["primary/teacher-facing/coach/prompt.md"]);
    assert.deepEqual(diff.new.map((f) => f.path), ["primary/new-file.md"]);
    assert.deepEqual(diff.deleted.map((f) => f.path), ["primary/ghost.md"]);
  });

  test("empty remote: everything is new", () => {
    const diff = diffStates(local, []);
    assert.equal(diff.new.length, 3);
    assert.equal(diff.deleted.length, 0);
  });
});

// ---------------------------------------------------------------------------
// validateBrainTree
// ---------------------------------------------------------------------------

describe("validateBrainTree", () => {
  function entry(relativePath, content) {
    return { relativePath, content };
  }

  const validTree = [
    entry("primary/context.md", "ctx"),
    entry("primary/teacher-facing/coach/config.json", JSON.stringify({ model: "m" })),
    entry("primary/teacher-facing/coach/prompt.md", "prompt"),
  ];

  test("valid tree produces no errors", () => {
    assert.deepEqual(validateBrainTree(validTree), []);
  });

  test("flags pipeline folder missing prompt.md", () => {
    const tree = validTree.filter((f) => !f.relativePath.endsWith("prompt.md"));
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /prompt\.md/);
  });

  test("flags pipeline folder missing config.json", () => {
    const tree = validTree.filter((f) => !f.relativePath.endsWith("config.json"));
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /config\.json/);
  });

  test("flags blank .md file", () => {
    const tree = [...validTree, entry("primary/blank.md", "   \n  ")];
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /blank/i);
    assert.equal(errors[0].path, "primary/blank.md");
  });

  test("flags unsupported extension", () => {
    const tree = [...validTree, entry("primary/photo.png", "binary")];
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unsupported/i);
  });

  test("flags duplicate basenames in same folder (docId collision)", () => {
    const tree = [...validTree, entry("primary/teacher-facing/coach/config.md", "dup")];
    const errors = validateBrainTree(tree);
    // Per-folder duplicate + cross-folder docId collision both fire
    const dupErr = errors.find((e) => e.message.includes("Duplicate"));
    assert.ok(dupErr, "expected per-folder duplicate basename error");
  });

  test("flags invalid config JSON", () => {
    const tree = [
      entry("primary/teacher-facing/coach/config.json", "not json"),
      entry("primary/teacher-facing/coach/prompt.md", "p"),
    ];
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /JSON/);
  });

  test("flags config missing model field", () => {
    const tree = [
      entry("primary/teacher-facing/coach/config.json", JSON.stringify({ temperature: 1 })),
      entry("primary/teacher-facing/coach/prompt.md", "p"),
    ];
    const errors = validateBrainTree(tree);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /model/);
  });

  test("rejects basename containing -- (reserved doc ID separator)", () => {
    const tree = [
      ...validTree,
      entry("primary/teacher-facing--notes.md", "content"),
    ];
    const errors = validateBrainTree(tree);
    const dashErrors = errors.filter((e) => e.message.includes("--"));
    assert.ok(dashErrors.length >= 1, "expected error for basename with --");
    assert.match(dashErrors[0].message, /reserved/i);
  });

  test("cross-folder docId collision produces both -- rejection and collision error", () => {
    // "primary/teacher-facing--notes.md" at program level:
    //   basename = "teacher-facing--notes" (caught by -- rejection)
    //   docId = "teacher-facing--notes"
    // "primary/teacher-facing/notes.md" at audience level:
    //   docId = "teacher-facing--notes"
    // Both errors should fire: the -- rejection AND the cross-folder collision.
    const tree = [
      ...validTree,
      entry("primary/teacher-facing--notes.md", "content A"),
      entry("primary/teacher-facing/notes.md", "content B"),
    ];
    const errors = validateBrainTree(tree);
    const reservedErr = errors.find((e) => e.message.includes("reserved"));
    const collisionErr = errors.find((e) => e.message.includes("Doc ID collision"));
    assert.ok(reservedErr, "expected -- reserved separator error");
    assert.ok(collisionErr, "expected cross-folder docId collision error");
  });

  test("no false-positive docId collisions on valid tree", () => {
    assert.deepEqual(validateBrainTree(validTree), []);
  });

  test("empty program folder errors when directories provided", () => {
    // Tree has files only under primary — but directories include elementary
    const directories = ["primary", "primary/teacher-facing", "primary/teacher-facing/coach", "elementary"];
    const errors = validateBrainTree(validTree, { directories });
    const emptyProgram = errors.find((e) => e.path === "elementary");
    assert.ok(emptyProgram, "expected error for empty program folder");
    assert.match(emptyProgram.message, /contains no files/);
  });

  test("empty pipeline folder errors when directories provided", () => {
    // Tree has files in coach — but an empty sibling pipeline folder exists
    const directories = [
      "primary",
      "primary/teacher-facing",
      "primary/teacher-facing/coach",
      "primary/teacher-facing/empty-pipeline",
    ];
    const errors = validateBrainTree(validTree, { directories });
    const emptyPipeline = errors.find((e) => e.path === "primary/teacher-facing/empty-pipeline");
    assert.ok(emptyPipeline, "expected error for empty pipeline folder");
    assert.match(emptyPipeline.message, /contains no files/);
  });

  test("empty school-wide pipeline folder (depth 2 non-audience) errors", () => {
    const swTree = [
      entry("school-wide/nomenclature.md", "content"),
    ];
    const directories = ["school-wide", "school-wide/empty-summarizer"];
    const errors = validateBrainTree(swTree, { directories });
    const emptyPipeline = errors.find((e) => e.path === "school-wide/empty-summarizer");
    assert.ok(emptyPipeline, "expected error for empty school-wide pipeline");
    assert.match(emptyPipeline.message, /contains no files/);
  });

  test("normal tree with directories passes validation", () => {
    const directories = ["primary", "primary/teacher-facing", "primary/teacher-facing/coach"];
    assert.deepEqual(validateBrainTree(validTree, { directories }), []);
  });

  test("without directories option, empty folder check is skipped", () => {
    // No directories passed, so no empty folder errors
    assert.deepEqual(validateBrainTree(validTree), []);
  });
});

// ---------------------------------------------------------------------------
// buildParentMetadata
// ---------------------------------------------------------------------------

describe("buildParentMetadata", () => {
  const classified = [
    classifyFile("primary/context.md"),
    classifyFile("primary/nomenclature.md"),
    classifyFile("primary/teacher-facing/coach/config.json"),
    classifyFile("primary/teacher-facing/coach/prompt.md"),
    classifyFile("primary/parent-facing/term-report/config.json"),
    classifyFile("primary/parent-facing/term-report/prompt.md"),
  ];

  test("builds full metadata shape", () => {
    const meta = buildParentMetadata("primary", classified, {
      name: "Thilak",
      email: "t@example.com",
    });
    assert.equal(meta.docCount, 6);
    assert.deepEqual(meta.pipelineIds, ["coach", "term-report"]);
    assert.equal(meta.lastSyncedByName, "Thilak");
    assert.equal(meta.lastSyncedByEmail, "t@example.com");
    assert.deepEqual(meta.includesPrograms, ["toddler", "primary"]);
  });

  test("non-primary program includes only itself", () => {
    const meta = buildParentMetadata("elementary", [], { name: "x", email: "y" });
    assert.deepEqual(meta.includesPrograms, ["elementary"]);
  });
});

// ---------------------------------------------------------------------------
// parseConfigJson
// ---------------------------------------------------------------------------

describe("parseConfigJson", () => {
  test("parses valid config, extra fields pass through", () => {
    const parsed = parseConfigJson(
      JSON.stringify({ model: "gpt-x", temperature: 0.2, minSamples: 3 }),
      "p/config.json",
    );
    assert.deepEqual(parsed, { model: "gpt-x", temperature: 0.2, minSamples: 3 });
  });

  test("throws on invalid JSON", () => {
    assert.throws(() => parseConfigJson("{oops", "p/config.json"), /JSON/);
  });

  test("throws when model missing", () => {
    assert.throws(() => parseConfigJson("{}", "p/config.json"), /model/);
  });
});

// ---------------------------------------------------------------------------
// countLineDelta
// ---------------------------------------------------------------------------

describe("countLineDelta", () => {
  test("added lines only", () => {
    assert.deepEqual(countLineDelta("a\nb", "a\nb\nc\nd"), { added: 2, removed: 0 });
  });

  test("removed lines only", () => {
    assert.deepEqual(countLineDelta("a\nb\nc", "a"), { added: 0, removed: 2 });
  });

  test("changed line counts as one added one removed", () => {
    assert.deepEqual(countLineDelta("a\nb", "a\nB"), { added: 1, removed: 1 });
  });

  test("identical content: zero delta", () => {
    assert.deepEqual(countLineDelta("a\nb", "a\nb"), { added: 0, removed: 0 });
  });
});

// ---------------------------------------------------------------------------
// findPlaceholderModels
// ---------------------------------------------------------------------------

describe("findPlaceholderModels", () => {
  function configEntry(relativePath, model) {
    return {
      relativePath,
      content: JSON.stringify({ model, temperature: 0.3 }),
      classified: classifyFile(relativePath),
    };
  }

  function knowledgeEntry(relativePath) {
    return {
      relativePath,
      content: "# Knowledge",
      classified: classifyFile(relativePath),
    };
  }

  test("returns config entries with placeholder model", () => {
    const entries = [
      configEntry("primary/teacher-facing/coach/config.json", "placeholder-set-before-use"),
      configEntry("primary/parent-facing/term-report/config.json", "gpt-4o-mini"),
      knowledgeEntry("primary/teacher-facing/coach/prompt.md"),
    ];
    const result = findPlaceholderModels(entries);
    assert.equal(result.length, 1);
    assert.equal(result[0].relativePath, "primary/teacher-facing/coach/config.json");
  });

  test("returns empty array when no placeholders", () => {
    const entries = [
      configEntry("primary/teacher-facing/coach/config.json", "gpt-4o-mini"),
      knowledgeEntry("primary/context.md"),
    ];
    assert.deepEqual(findPlaceholderModels(entries), []);
  });
});

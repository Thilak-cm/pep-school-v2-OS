/**
 * Tests for push-brain sync helpers (#157).
 *
 * These helpers are deliberately pure (no Firebase init side effects),
 * so they are imported directly — unlike older admin script tests that
 * inline logic to dodge Firebase initialization.
 *
 * Run with: node --test scripts/admin/push-brain.helpers.test.mjs
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  walkBrainFolder,
  classifyFile,
  computeChecksum,
  buildDocId,
  buildFileDoc,
  extractFolders,
  detectStructuralChanges,
  diffStates,
  validateBrainTree,
  buildParentMetadata,
  parseConfigJson,
  countLineDelta,
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
// extractFolders + detectStructuralChanges
// ---------------------------------------------------------------------------

describe("structural change detection", () => {
  const files = [
    "primary/context.md",
    "primary/teacher-facing/coach/prompt.md",
    "primary/teacher-facing/coach/config.json",
    "school-wide/nomenclature.md",
  ];

  test("extractFolders returns unique sorted folder set", () => {
    const folders = extractFolders(files);
    assert.deepEqual(folders, [
      "primary",
      "primary/teacher-facing",
      "primary/teacher-facing/coach",
      "school-wide",
    ]);
  });

  test("no changes when trees match", () => {
    const folders = extractFolders(files);
    const changes = detectStructuralChanges(folders, folders);
    assert.deepEqual(changes, { added: [], removed: [] });
  });

  test("detects added folder", () => {
    const manifest = extractFolders(files);
    const current = [...manifest, "primary/teacher-facing/new-pipeline"];
    const changes = detectStructuralChanges(current, manifest);
    assert.deepEqual(changes.added, ["primary/teacher-facing/new-pipeline"]);
    assert.deepEqual(changes.removed, []);
  });

  test("detects removed folder", () => {
    const manifest = extractFolders(files);
    const current = manifest.filter((f) => f !== "primary/teacher-facing/coach");
    const changes = detectStructuralChanges(current, manifest);
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
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /duplicate/i);
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

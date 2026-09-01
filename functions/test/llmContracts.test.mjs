/**
 * Static contract tests for LLM infrastructure (#187).
 *
 * These read source files and verify structural invariants without
 * executing any Cloud Functions. Pattern: chatRuntimeContracts.test.mjs.
 *
 * Run: node --test functions/test/llmContracts.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = join(__dirname, "..");

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir, results = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectJsFiles(full, results);
    } else if (name.endsWith(".js") && !name.endsWith(".test.js")) {
      results.push(full);
    }
  }
  return results;
}

const allJsFiles = collectJsFiles(FUNCTIONS_ROOT);

function readSource(relativePath) {
  return readFileSync(join(FUNCTIONS_ROOT, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Contract: No direct-OpenAI chat completions
// ---------------------------------------------------------------------------

describe("no direct-OpenAI chat completions", () => {
  it("api.openai.com/v1/chat does not appear in any production source", () => {
    const violations = [];
    for (const file of allJsFiles) {
      const content = readFileSync(file, "utf8");
      if (content.includes("api.openai.com/v1/chat")) {
        const rel = file.replace(FUNCTIONS_ROOT + "/", "");
        violations.push(rel);
      }
    }
    assert.deepEqual(violations, [], `Files with direct OpenAI chat endpoints: ${violations.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Contract: api.openai.com only in whisper.js
// ---------------------------------------------------------------------------

describe("OpenAI API scoping", () => {
  it("api.openai.com only appears in ai/whisper.js", () => {
    const violations = [];
    for (const file of allJsFiles) {
      const content = readFileSync(file, "utf8");
      const rel = file.replace(FUNCTIONS_ROOT + "/", "");
      if (content.includes("api.openai.com") && rel !== "ai/whisper.js") {
        violations.push(rel);
      }
    }
    assert.deepEqual(violations, [], `Unexpected api.openai.com references: ${violations.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Contract: OPENAI_API_KEY only in whisper-related files
// ---------------------------------------------------------------------------

describe("OPENAI_API_KEY scoping", () => {
  it("OPENAI_API_KEY is only referenced by whisper-related files", () => {
    const ALLOWED = new Set(["ai/whisper.js", "shared/openai.js"]);
    const violations = [];
    for (const file of allJsFiles) {
      const content = readFileSync(file, "utf8");
      const rel = file.replace(FUNCTIONS_ROOT + "/", "");
      if (content.includes("OPENAI_API_KEY") && !ALLOWED.has(rel)) {
        violations.push(rel);
      }
    }
    assert.deepEqual(violations, [], `Unexpected OPENAI_API_KEY references: ${violations.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Contract: Every LLM CF has Langfuse secrets
// ---------------------------------------------------------------------------

describe("Langfuse coverage", () => {
  // CFs that make LLM calls must include LANGFUSE_SECRET_KEY in secrets
  const LLM_CF_FILES = [
    "ai/textCleanup.js",
    "ai/coach.js",
    "ai/baseballCard.js",
    "ai/handwriting.js",
    "ai/whisper.js",
    "media/index.js",
    "reports/index.js",
    "monthlyPlan/index.js",
    "students/soul.js",
    "chat/index.js",
    "digest/index.js",
  ];

  for (const file of LLM_CF_FILES) {
    it(`${file} includes LANGFUSE_SECRET_KEY in secrets`, () => {
      const source = readSource(file);
      // Every secrets array should include Langfuse keys
      const secretsArrays = source.match(/secrets:\s*\[[^\]]+\]/g) || [];
      assert.ok(secretsArrays.length > 0, `No secrets arrays found in ${file}`);
      for (const arr of secretsArrays) {
        assert.ok(
          arr.includes("LANGFUSE_SECRET_KEY"),
          `Missing LANGFUSE_SECRET_KEY in secrets array in ${file}: ${arr}`,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Contract: modelConstants.js is deleted
// ---------------------------------------------------------------------------

describe("modelConstants.js deleted", () => {
  it("functions/config/modelConstants.js does not exist", () => {
    const exists = allJsFiles.some((f) => f.endsWith("config/modelConstants.js"));
    assert.equal(exists, false, "modelConstants.js should be deleted");
  });

  it("no source files import from modelConstants.js", () => {
    const violations = [];
    for (const file of allJsFiles) {
      const content = readFileSync(file, "utf8");
      if (content.includes("modelConstants")) {
        const rel = file.replace(FUNCTIONS_ROOT + "/", "");
        // Allow comments referencing the deletion
        const lines = content.split("\n");
        const hasRealImport = lines.some(
          (l) => l.includes("modelConstants") && !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"),
        );
        if (hasRealImport) violations.push(rel);
      }
    }
    assert.deepEqual(violations, [], `Files still importing modelConstants: ${violations.join(", ")}`);
  });
});

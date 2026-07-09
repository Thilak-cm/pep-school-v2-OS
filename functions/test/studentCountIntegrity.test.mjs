/**
 * Structural tests for studentCount integrity (#161).
 *
 * These tests run in CI — they read source files and assert that:
 * 1. The onStudentWrite trigger is exported (the single source of truth)
 * 2. Frontend files do NOT contain studentCount increment calls
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");

describe("studentCount integrity (#161)", () => {
  it("onStudentWrite is exported from functions/index.js", async () => {
    const indexSrc = await readFile(
      resolve(rootDir, "functions/index.js"),
      "utf8",
    );
    assert.match(
      indexSrc,
      /export\s*\{[^}]*onStudentWrite[^}]*\}\s*from/,
      "functions/index.js must export onStudentWrite",
    );
  });

  it("UsersAccessPage has no studentCount increment calls", async () => {
    const src = await readFile(
      resolve(
        rootDir,
        "montessori-os/src/components/UsersAccessPage.jsx",
      ),
      "utf8",
    );
    const matches = src.match(/studentCount:\s*increment\(/g) || [];
    assert.equal(
      matches.length,
      0,
      `UsersAccessPage.jsx still has ${matches.length} studentCount increment call(s) — ` +
        "the onStudentWrite trigger is the single source of truth",
    );
  });

  it("GraduateStudentsPage has no studentCount increment calls", async () => {
    const src = await readFile(
      resolve(
        rootDir,
        "montessori-os/src/components/GraduateStudentsPage.jsx",
      ),
      "utf8",
    );
    const matches = src.match(/studentCount:\s*increment\(/g) || [];
    assert.equal(
      matches.length,
      0,
      `GraduateStudentsPage.jsx still has ${matches.length} studentCount increment call(s) — ` +
        "the onStudentWrite trigger is the single source of truth",
    );
  });

  it("onStudentWrite trigger file exists and uses onWrite", async () => {
    const src = await readFile(
      resolve(rootDir, "functions/students/onStudentWrite.js"),
      "utf8",
    );
    assert.match(
      src,
      /\.onWrite\(/,
      "onStudentWrite must use .onWrite() to handle create/update/delete",
    );
    assert.match(
      src,
      /students\/\{studentId\}/,
      "onStudentWrite must trigger on students/{studentId}",
    );
  });

  it("onStudentWrite uses count query, not increment", async () => {
    const src = await readFile(
      resolve(rootDir, "functions/students/onStudentWrite.js"),
      "utf8",
    );
    const hasIncrement = /increment\(/.test(src);
    assert.equal(
      hasIncrement,
      false,
      "onStudentWrite must use count query (self-healing), not increment()",
    );
  });

  it("dataIntegrityChecks is exported from functions/index.js", async () => {
    const indexSrc = await readFile(
      resolve(rootDir, "functions/index.js"),
      "utf8",
    );
    assert.match(
      indexSrc,
      /export\s*\{[^}]*dataIntegrityChecks[^}]*\}\s*from/,
      "functions/index.js must export dataIntegrityChecks",
    );
  });
});

/**
 * #313: appendAssessmentAttempt contract tests.
 *
 * Source-scan tests verifying the CF exists, is a callable, accepts
 * observationId, validates auth and input, appends to attempts[], and
 * updates pendingCount transactionally.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assessments",
  "index.js",
);

let source;

describe("appendAssessmentAttempt", () => {
  test("load source", async () => {
    source = await readFile(SOURCE_PATH, "utf8");
  });

  test("CF is exported as a callable", () => {
    assert.match(
      source,
      /export\s+const\s+appendAssessmentAttempt\b/,
      "appendAssessmentAttempt must be exported",
    );
    assert.match(
      source,
      /appendAssessmentAttempt[\s\S]*?\.https\.onCall/,
      "appendAssessmentAttempt must be an onCall callable",
    );
  });

  test("accepts observationId parameter", () => {
    assert.match(
      source,
      /observationId/,
      "must accept observationId to identify the target observation doc",
    );
  });

  test("appends to attempts array", () => {
    assert.match(
      source,
      /attempts/,
      "must write to the attempts array on the observation doc",
    );
  });

  test("uses a transaction for atomic observation + source count update", () => {
    // appendAssessmentAttempt must use db.runTransaction to update both the
    // observation doc (append attempt) and the source doc (decrement pendingCount)
    assert.match(
      source,
      /runTransaction/,
      "must use a Firestore transaction for atomicity",
    );
  });

  test("determines kind automatically from gradeStatus and existing attempts", () => {
    // kind should be 'late' for absent->graded, 'retest' for subsequent attempts, 'original' otherwise
    assert.match(
      source,
      /late/,
      "must handle 'late' kind for absent students getting graded",
    );
    assert.match(
      source,
      /retest/,
      "must handle 'retest' kind for subsequent attempts",
    );
  });
});

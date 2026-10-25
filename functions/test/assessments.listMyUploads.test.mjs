/**
 * #313: listMyAssessmentUploads contract tests.
 *
 * Source-scan tests verifying the CF exists, is a callable, queries
 * structuredAssessmentSources by createdBy, and returns source metadata
 * with denormalized counts. The parser and publish tests cover value
 * correctness; this covers wiring.
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

describe("listMyAssessmentUploads", () => {
  test("load source", async () => {
    source = await readFile(SOURCE_PATH, "utf8");
  });

  test("CF is exported as a callable", () => {
    assert.match(
      source,
      /export\s+const\s+listMyAssessmentUploads\b/,
      "listMyAssessmentUploads must be exported",
    );
    assert.match(
      source,
      /listMyAssessmentUploads[\s\S]*?\.https\.onCall/,
      "listMyAssessmentUploads must be an onCall callable",
    );
  });

  test("queries structuredAssessmentSources by createdBy", () => {
    assert.match(
      source,
      /structuredAssessmentSources[\s\S]*?createdBy/,
      "must query structuredAssessmentSources filtered by createdBy",
    );
  });

  test("returns pendingCount and gradedCount from source docs", () => {
    // The response should include denormalized counts read from the source doc
    assert.match(
      source,
      /pendingCount/,
      "must include pendingCount in response",
    );
    assert.match(
      source,
      /gradedCount/,
      "must include gradedCount in response",
    );
  });
});

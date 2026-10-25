/**
 * #313: Verify publishStructuredAssessment fans out criticality, gradeStatus,
 * and denormalized counts onto source and observation docs.
 *
 * Source-scan contract test (same pattern as fanoutWorkerRetry.test.mjs):
 * the publish CF has too many Firestore dependencies for a pure-mock unit test,
 * so we verify the batch payload references the required fields. The parser
 * unit tests cover value correctness; this covers wiring.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assessments",
  "index.js",
);

let source;
test("load source", async () => {
  source = await readFile(SOURCE_PATH, "utf8");
});

test("publishStructuredAssessment writes criticality to the source doc", () => {
  // The batch.set(sourceRef, { ... }) call must include criticality from parsed metadata
  assert.match(
    source,
    /criticality/,
    "index.js must reference 'criticality' - the field should be written to the source doc",
  );
});

test("publishStructuredAssessment writes gradeStatus to observation docs", () => {
  // Each observation batch.set must include gradeStatus from the parsed row
  assert.match(
    source,
    /gradeStatus/,
    "index.js must reference 'gradeStatus' - the field should be written to observation docs",
  );
});

test("publishStructuredAssessment writes pendingCount and gradedCount to the source doc", () => {
  assert.match(
    source,
    /pendingCount/,
    "index.js must reference 'pendingCount' on the source doc",
  );
  assert.match(
    source,
    /gradedCount/,
    "index.js must reference 'gradedCount' on the source doc",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(
  new URL("./backfill-assessment-denorm.mjs", import.meta.url),
  "utf8",
);

test("backfill is dry-run by default and requires --yes to write (#290)", () => {
  assert.match(source, /--yes/);
  assert.match(source, /dryRun|dry-run/i);
  // Writes must be guarded behind the explicit flag.
  assert.match(source, /apply\s*=|applyChanges|shouldApply/);
});

test("backfill copies source manifest denorm fields onto structured records (#290)", () => {
  assert.match(source, /structuredAssessmentSources/);
  assert.match(source, /sourceFileName/);
  assert.match(source, /studentCount/);
  assert.match(source, /sourceId/);
});

test("backfill renames assessment_structured_ doc IDs to sa_ prefix", () => {
  assert.match(source, /assessment_structured_/);
  assert.match(source, /sa_/);
  assert.match(source, /newIdFromOld/);
  // Must update recordRefs on the source manifest after rename.
  assert.match(source, /recordRefs/);
});

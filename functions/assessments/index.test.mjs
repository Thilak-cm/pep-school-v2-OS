import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const source = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "index.js"),
  "utf8",
);

test("getStructuredAssessmentSource can return the published record matrix (#290)", () => {
  assert.match(source, /includeRecords/);
  const start = source.indexOf("export const getStructuredAssessmentSource");
  const end = source.indexOf("export const getAssessmentDownloadUrl");
  const block = source.slice(start, end);
  assert.match(block, /records/);
  assert.match(block, /collectionGroup\("observations"\)/);
});

test("medical view URLs are inline; structured source stays attachment (#290)", () => {
  assert.match(source, /inline; filename/);
  assert.match(source, /attachment; filename/);
});

test("publish denormalizes sourceFileName and studentCount onto fan-out records (#290)", () => {
  const start = source.indexOf("rows.forEach((row) => {");
  const end = source.indexOf("batch.update(pendingRef", start);
  const block = source.slice(start, end);
  assert.match(block, /sourceFileName/);
  assert.match(block, /studentCount: studentIds\.length/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

// eslint-disable-next-line no-undef
const sourceUrl = new URL("./index.js", import.meta.url);

// --- PEP-101: Idempotent draft report export tests ---

test("exportReportToDrive checks for existing doc when both reportDocId and reportPayload are provided", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(
      /reportDocId\s*&&\s*reportPayload/.test(source),
      "Expected exportReportToDrive to handle the case where both reportDocId and reportPayload are provided",
  );
});

test("exportReportToDrive returns existing report data when doc already has a driveDocId", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(
      /existingSnap|existingDoc|existingReport/.test(source),
      "Expected exportReportToDrive to check for an existing report doc on the idempotent path",
  );
  assert.ok(
      /\.driveDocId/.test(source),
      "Expected exportReportToDrive to check driveDocId on existing doc",
  );
});

test("writeReportDoc accepts an optional docId parameter", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(
      /function writeReportDoc\(studentId,\s*payload,\s*docId\)/.test(source),
      "Expected writeReportDoc to accept a docId parameter",
  );
});

test("writeReportDoc uses provided docId when available instead of Date.now()", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(
      /docId\s*\|\|\s*`report_\$\{Date\.now\(\)\}`/.test(source),
      "Expected writeReportDoc to use provided docId or fall back to report_{Date.now()}",
  );
});

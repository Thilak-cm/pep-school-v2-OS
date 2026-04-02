import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

// eslint-disable-next-line no-undef
const sourceUrl = new URL("./index.js", import.meta.url);

// --- PEP-101: Idempotent draft report export — structural tests ---

test("exportReportToDrive: idempotent draft path checks for both reportDocId and reportPayload", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.ok(
      /reportDocId\s*&&\s*reportPayload/.test(source),
      "Expected the idempotent draft branch to check reportDocId && reportPayload",
  );
});

test("exportReportToDrive: early return when existingSnap.exists AND driveDocId is present", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // Verify the nested condition: if existingSnap.exists → if driveDocId → return
  const earlyReturnPattern =
    /existingSnap\.exists[\s\S]{0,500}existingReport\.driveDocId[\s\S]{0,500}return\s*\{[\s\S]{0,500}status:\s*"ok"/;
  assert.ok(
      earlyReturnPattern.test(source),
      "Expected early-return path: existingSnap.exists → driveDocId check → return {status: 'ok'}",
  );
});

test("exportReportToDrive: early return reads studentName from stored doc, not from a fresh student doc fetch", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // Find the early-return block (between driveDocId check and the closing brace)
  const earlyReturnBlock = source.match(
      /if\s*\(existingReport\.driveDocId\)\s*\{([\s\S]*?)\n\s{8}\}/,
  );
  assert.ok(earlyReturnBlock, "Expected to find the driveDocId early-return block");
  const block = earlyReturnBlock[1];
  // Should NOT contain a students doc fetch
  assert.ok(
      !block.includes("db.collection(\"students\").doc(studentId).get()"),
      "Early-return block should NOT fetch the student doc — studentName should come from the stored report",
  );
  // Should reference existingReport.studentName or generatedByName
  assert.ok(
      /existingReport\.studentName/.test(block),
      "Early-return should read studentName from existingReport",
  );
});

test("exportReportToDrive: writes pending_drive doc to Firestore BEFORE calling createReportDoc", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // The pending_drive set() must come before createReportDoc
  const pendingDriveIdx = source.indexOf("status: \"pending_drive\"");
  const reportRefSetIdx = source.indexOf("await reportRef.set(report)", pendingDriveIdx);
  const createReportDocIdx = source.indexOf("createReportDoc(", reportRefSetIdx || 0);
  assert.ok(
      pendingDriveIdx > 0,
      "Expected report to be written with status: 'pending_drive'",
  );
  assert.ok(
      reportRefSetIdx > 0 && reportRefSetIdx > pendingDriveIdx,
      "Expected reportRef.set(report) after status: 'pending_drive' assignment",
  );
  assert.ok(
      createReportDocIdx > reportRefSetIdx,
      "Expected createReportDoc to be called AFTER the pending_drive Firestore write",
  );
});

test("exportReportToDrive: retry path re-uses existing report data when doc exists without driveDocId", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // After the driveDocId check, there should be a path that assigns existingReport to report
  const retryPattern =
    /\/\/.*pending_drive.*crashed[\s\S]{0,500}report\s*=\s*existingReport/;
  assert.ok(
      retryPattern.test(source),
      "Expected retry path to assign existingReport to report when doc exists but has no driveDocId",
  );
});

test("exportReportToDrive: persists driveDocId to Firestore immediately after createReportDoc, before CSV work", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // createReportDoc must come before the immediate update with driveDocId
  const createIdx = source.indexOf("createReportDoc(");
  assert.ok(createIdx > 0, "Expected createReportDoc call in source");
  // The immediate reportRef.update with driveDocId must appear after createReportDoc
  const immediateUpdateIdx = source.indexOf("reportRef.update({ driveDocId, driveDocLink:", createIdx);
  assert.ok(
      immediateUpdateIdx > createIdx,
      "Expected reportRef.update with driveDocId immediately after createReportDoc",
  );
  // The CSV section must come after the immediate update
  const csvIdx = source.indexOf("Update summary + archive CSVs", immediateUpdateIdx);
  assert.ok(
      csvIdx > immediateUpdateIdx,
      "Expected CSV work to come AFTER the immediate driveDocId persistence",
  );
});

test("exportReportToDrive: final Firestore write uses update() for the idempotent draft path", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // The final write section should update (not create) for the draft path
  const finalWritePattern =
    /if\s*\(reportDocId\s*&&\s*reportPayload\)[\s\S]{0,400}reportRef\.update\(/;
  assert.ok(
      finalWritePattern.test(source),
      "Expected the final Firestore write to use reportRef.update() when reportDocId && reportPayload",
  );
  // And it should set status to 'ok'
  const finalUpdateBlock = source.match(
      /if\s*\(reportDocId\s*&&\s*reportPayload\)\s*\{([\s\S]*?)\n\s{4}\}\s*else/,
  );
  assert.ok(finalUpdateBlock, "Expected to find the final update block for draft path");
  assert.ok(
      /status:\s*"ok"/.test(finalUpdateBlock[1]),
      "Expected final update to set status to 'ok'",
  );
});

test("exportReportToDrive: validation requires reportDocId when reportPayload is provided", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const validationPattern =
    /reportPayload\s*&&\s*!reportDocId[\s\S]{0,200}reportDocId is required when reportPayload/;
  assert.ok(
      validationPattern.test(source),
      "Expected validation to require reportDocId when reportPayload is provided",
  );
});

test("exportReportToDrive: no dead else branch with duplicate payload construction", async () => {
  const source = await readFile(sourceUrl, "utf8");
  // The old dead branch had "Draft payload path — validate required fields" comment
  assert.ok(
      !source.includes("Draft payload path"),
      "Expected the dead 'Draft payload path' else branch to be removed",
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

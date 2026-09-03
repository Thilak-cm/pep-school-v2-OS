import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyProbeData,
  classifyProbeError,
  buildProbeList,
  formatDriveIntegritySignal,
  academicYearStart,
  currentMonthIST,
} from "../verification/driveIntegrity.js";

const DRIVE = "0ANF5MPbc7nZEUk9PVA";

describe("classifyProbeData", () => {
  it("live folder in the shared drive is ok", () => {
    assert.equal(classifyProbeData({ trashed: false, driveId: DRIVE }, DRIVE), "ok");
  });

  it("trashed is dead", () => {
    assert.equal(classifyProbeData({ trashed: true, driveId: DRIVE }, DRIVE), "dead");
  });

  it("different driveId is moved_out", () => {
    assert.equal(classifyProbeData({ trashed: false, driveId: "other" }, DRIVE), "moved_out");
  });

  it("missing driveId (e.g. root probe response) is ok", () => {
    assert.equal(classifyProbeData({ trashed: false }, DRIVE), "ok");
  });
});

describe("classifyProbeError", () => {
  it("404 is dead", () => {
    assert.equal(classifyProbeError(404), "dead");
  });

  it("403 is access_lost, not dead", () => {
    assert.equal(classifyProbeError(403), "access_lost");
  });

  it("transient statuses are unverifiable", () => {
    assert.equal(classifyProbeError(429), "unverifiable");
    assert.equal(classifyProbeError(500), "unverifiable");
    assert.equal(classifyProbeError(undefined), "unverifiable");
  });
});

describe("buildProbeList", () => {
  it("always probes the shared drive root first", () => {
    const probes = buildProbeList({ sharedDriveId: DRIVE });
    assert.equal(probes.length, 1);
    assert.equal(probes[0].kind, "shared_drive_root");
    assert.equal(probes[0].fileId, DRIVE);
  });

  it("skips classrooms without driveFolderId (lazy creation is legitimate)", () => {
    const probes = buildProbeList({
      classrooms: [
        { id: "nilgiris", name: "Nilgiris", driveFolderId: "f1" },
        { id: "orion", name: "Orion", driveFolderId: null },
      ],
      sharedDriveId: DRIVE,
    });
    const classroomProbes = probes.filter((p) => p.kind === "classroom_folder");
    assert.equal(classroomProbes.length, 1);
    assert.equal(classroomProbes[0].label, "Nilgiris");
  });

  it("emits plan doc + checklist probes per student and skips missing IDs", () => {
    const probes = buildProbeList({
      planDocs: [
        { studentId: "2026-NIL-004", month: "2026-09", driveDocId: "d1", driveChecklistId: "c1" },
        { studentId: "2026-NIL-005", month: "2026-09", driveDocId: null, driveChecklistId: null },
      ],
      sharedDriveId: DRIVE,
    });
    const kinds = probes.map((p) => p.kind);
    assert.deepEqual(kinds, ["shared_drive_root", "plan_doc", "plan_checklist"]);
    assert.equal(probes[1].label, "2026-NIL-004 (2026-09)");
  });

  it("emits report probes with type in the label", () => {
    const probes = buildProbeList({
      reportDocs: [
        { studentId: "2026-GUL-007", reportType: "baseline", driveDocId: "r1" },
        { studentId: "2026-GUL-008", driveDocId: null },
      ],
      sharedDriveId: DRIVE,
    });
    const reportProbes = probes.filter((p) => p.kind === "report_doc");
    assert.equal(reportProbes.length, 1);
    assert.equal(reportProbes[0].label, "2026-GUL-007 baseline");
  });
});

describe("formatDriveIntegritySignal", () => {
  const okProbe = (kind, label) => ({ kind, label, remediation: "r", verdict: "ok" });

  it("all-ok produces a green heartbeat with counts", () => {
    const { ok, message } = formatDriveIntegritySignal([
      okProbe("shared_drive_root", "root"),
      okProbe("classroom_folder", "Nilgiris"),
      okProbe("classroom_folder", "Himalayas"),
    ]);
    assert.equal(ok, true);
    assert.match(message, /Drive Integrity OK/);
    assert.match(message, /3\/3 probes OK/);
    assert.match(message, /2 classroom_folder/);
  });

  it("dead pointers produce a problem signal with remediation", () => {
    const { ok, message } = formatDriveIntegritySignal([
      okProbe("shared_drive_root", "root"),
      { kind: "classroom_folder", label: "Nilgiris", remediation: "untrash within 30d", verdict: "dead" },
      { kind: "classroom_folder", label: "Himalayas", remediation: "untrash within 30d", verdict: "access_lost" },
    ]);
    assert.equal(ok, false);
    assert.match(message, /Drive Integrity Problems/);
    assert.match(message, /DEAD classroom_folder: Nilgiris - untrash within 30d/);
    assert.match(message, /ACCESS LOST classroom_folder: Himalayas/);
    assert.match(message, /1\/3 probes OK/);
  });

  it("warnings alone keep ok=true but change the header", () => {
    const { ok, message } = formatDriveIntegritySignal([
      okProbe("shared_drive_root", "root"),
      { kind: "plan_doc", label: "2026-NIL-004 (2026-09)", remediation: "re-export", verdict: "unverifiable" },
    ]);
    assert.equal(ok, true);
    assert.match(message, /Drive Integrity Warnings/);
    assert.match(message, /UNVERIFIABLE plan_doc/);
  });

  it("caps listed problems and reports overflow", () => {
    const problems = Array.from({ length: 15 }, (_, i) => ({
      kind: "plan_doc", label: `s${i}`, remediation: "r", verdict: "dead",
    }));
    const { message } = formatDriveIntegritySignal(problems);
    assert.match(message, /…and 3 more/);
  });

  it("escapes HTML in labels", () => {
    const { message } = formatDriveIntegritySignal([
      { kind: "classroom_folder", label: "<b>evil</b>", remediation: "r", verdict: "dead" },
    ]);
    assert.match(message, /&lt;b&gt;evil&lt;\/b&gt;/);
  });
});

describe("academicYearStart", () => {
  it("dates from June onward start the AY in the same year", () => {
    const start = academicYearStart(new Date(Date.UTC(2026, 8, 2))); // Sept 2026
    assert.equal(start.toISOString(), "2026-06-01T00:00:00.000Z");
  });

  it("dates before June belong to the previous AY", () => {
    const start = academicYearStart(new Date(Date.UTC(2026, 1, 15))); // Feb 2026
    assert.equal(start.toISOString(), "2025-06-01T00:00:00.000Z");
  });
});

describe("currentMonthIST", () => {
  it("rolls to the next month across the IST boundary", () => {
    // Aug 31 20:30 UTC = Sept 1 02:00 IST
    assert.equal(currentMonthIST(new Date("2026-08-31T20:30:00Z")), "2026-09");
  });

  it("stays in the current month before the boundary", () => {
    assert.equal(currentMonthIST(new Date("2026-08-31T10:00:00Z")), "2026-08");
  });
});

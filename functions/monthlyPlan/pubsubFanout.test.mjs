/**
 * #167: Pub/Sub fan-out tests for monthly plan batch.
 *
 * Tests the dispatcher logic (buildDispatchList) and worker message parsing.
 * Pure unit tests — no Firestore or Pub/Sub mocks needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDispatchList, parseWorkerMessage } from "./pubsubFanout.js";

// ---------------------------------------------------------------------------
// buildDispatchList — filters eligible students and skips already-done
// ---------------------------------------------------------------------------
describe("buildDispatchList", () => {
  it("includes eligible students without existing plans", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ programId: "primary", classroomId: "gulmohar" }) },
      { id: "S2", exists: true, data: () => ({ programId: "toddler", classroomId: "lily" }) },
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = {}; // no existing plans

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, ["S1", "S2"]);
    assert.equal(result.skipped, 0);
  });

  it("skips students whose plan already matches target month", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ programId: "primary", classroomId: "gulmohar" }) },
      { id: "S2", exists: true, data: () => ({ programId: "primary", classroomId: "gulmohar" }) },
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = { S1: "2026-07" }; // S1 already done

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, ["S2"]);
    assert.equal(result.skipped, 1);
  });

  it("includes students with stale plans from a prior month", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ programId: "primary", classroomId: "gulmohar" }) },
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = { S1: "2026-06" }; // old plan — needs update

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, ["S1"]);
    assert.equal(result.skipped, 0);
  });

  it("excludes non-existent student docs", () => {
    const studentSnaps = [
      { id: "S1", exists: false, data: () => ({}) },
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = {};

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, []);
    assert.equal(result.skipped, 0);
  });

  it("excludes elementary and adolescent programs", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ programId: "elementary", classroomId: "power" }) },
      { id: "S2", exists: true, data: () => ({ programId: "adolescent", classroomId: "allstars" }) },
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = {};

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, []);
    assert.equal(result.skipped, 0);
  });

  it("resolves program from classroom when student doc lacks programId", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ classroomId: "gulmohar" }) }, // no programId
      { id: "S2", exists: true, data: () => ({ classroomId: "power" }) },   // no programId
    ];
    const classroomProgramMap = { gulmohar: "primary", power: "elementary" };
    const existingPlanMonths = {};

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, ["S1"]); // gulmohar=primary, power=elementary
    assert.equal(result.skipped, 0);
  });

  it("returns correct counts for mixed scenario", () => {
    const studentSnaps = [
      { id: "S1", exists: true, data: () => ({ programId: "primary" }) },   // eligible, no plan
      { id: "S2", exists: true, data: () => ({ programId: "primary" }) },   // eligible, already done
      { id: "S3", exists: true, data: () => ({ programId: "primary" }) },   // eligible, old plan
      { id: "S4", exists: true, data: () => ({ programId: "elementary" }) }, // ineligible
      { id: "S5", exists: false, data: () => ({}) },                        // doesn't exist
    ];
    const classroomProgramMap = {};
    const existingPlanMonths = { S2: "2026-07", S3: "2026-06" };

    const result = buildDispatchList(studentSnaps, classroomProgramMap, existingPlanMonths, "2026-07");
    assert.deepEqual(result.toPublish, ["S1", "S3"]);
    assert.equal(result.skipped, 1); // S2 skipped
  });
});

// ---------------------------------------------------------------------------
// parseWorkerMessage — extracts and validates Pub/Sub message payload
// ---------------------------------------------------------------------------
describe("parseWorkerMessage", () => {
  it("parses a valid message with all fields", () => {
    const message = { json: { studentId: "2025-GUL-001", targetMonth: "2026-07" } };
    const result = parseWorkerMessage(message);
    assert.equal(result.studentId, "2025-GUL-001");
    assert.equal(result.targetMonth, "2026-07");
  });

  it("throws on missing studentId", () => {
    const message = { json: { targetMonth: "2026-07" } };
    assert.throws(() => parseWorkerMessage(message), /studentId is required/);
  });

  it("throws on missing targetMonth", () => {
    const message = { json: { studentId: "2025-GUL-001" } };
    assert.throws(() => parseWorkerMessage(message), /targetMonth is required/);
  });

  it("throws on empty/null json", () => {
    assert.throws(() => parseWorkerMessage({ json: null }), /invalid/i);
    assert.throws(() => parseWorkerMessage({ json: undefined }), /invalid/i);
  });
});

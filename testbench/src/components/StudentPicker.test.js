/**
 * PEP-223: StudentPicker scope logic tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveInitialState, filterAccessibleClassrooms, buildVisibleOptions } from "../utils/studentPickerHelpers.js";

describe("StudentPicker — resolveInitialState", () => {
  describe('scope="hardcoded"', () => {
    it("uses provided defaults as student list, no fetch", () => {
      const defaults = [{ id: "S1", displayName: "Student 1" }];
      const state = resolveInitialState({ scope: "hardcoded", defaults });
      assert.deepEqual(state.students, defaults);
      assert.equal(state.shouldFetch, false);
    });

    it("uses empty array when no defaults provided", () => {
      const state = resolveInitialState({ scope: "hardcoded" });
      assert.deepEqual(state.students, []);
      assert.equal(state.shouldFetch, false);
    });
  });

  describe('scope="program"', () => {
    it("starts empty and signals fetch", () => {
      const state = resolveInitialState({ scope: "program" });
      assert.deepEqual(state.students, []);
      assert.equal(state.shouldFetch, true);
    });
  });

  describe('scope="school-wide"', () => {
    it("starts empty and signals fetch", () => {
      const state = resolveInitialState({ scope: "school-wide" });
      assert.deepEqual(state.students, []);
      assert.equal(state.shouldFetch, true);
    });
  });

  describe("defaults to program scope", () => {
    it("treats unknown scope as program (fetch)", () => {
      const state = resolveInitialState({});
      assert.equal(state.shouldFetch, true);
    });
  });
});

describe("filterAccessibleClassrooms", () => {
  const classroomDocs = [
    { id: "allstars", teacherIds: ["t1", "t2"] },
    { id: "periwinkle", teacherIds: ["t2", "t3"] },
    { id: "elementary", teacherIds: ["t4"] },
  ];

  it("superadmin returns null (no filter)", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "superadmin", uid: "sa1", manageableClassrooms: [] });
    assert.equal(result, null);
  });

  it("classroomadmin returns Set of manageableClassrooms", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "classroomadmin", uid: "ca1", manageableClassrooms: ["allstars", "periwinkle"] });
    assert.deepEqual(result, new Set(["allstars", "periwinkle"]));
  });

  it("teacher returns Set of classrooms where teacherIds includes uid", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "teacher", uid: "t2", manageableClassrooms: [] });
    assert.deepEqual(result, new Set(["allstars", "periwinkle"]));
  });

  it("teacher with single classroom", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "teacher", uid: "t4", manageableClassrooms: [] });
    assert.deepEqual(result, new Set(["elementary"]));
  });

  it("unknown role returns empty Set", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "viewer", uid: "v1", manageableClassrooms: [] });
    assert.deepEqual(result, new Set());
  });

  it("classroomadmin with empty manageableClassrooms returns empty Set", () => {
    const result = filterAccessibleClassrooms({ classroomDocs, role: "classroomadmin", uid: "ca2", manageableClassrooms: [] });
    assert.deepEqual(result, new Set());
  });
});

describe("buildVisibleOptions", () => {
  const allStudents = [
    { id: "S1", displayName: "Aanya" },
    { id: "S2", displayName: "Bharat" },
    { id: "S3", displayName: "Chitra" },
    { id: "S4", displayName: "Devi" },
  ];
  const pinned = [
    { id: "S1", displayName: "Aanya", handwrittenCount: 9 },
    { id: "S3", displayName: "Chitra", handwrittenCount: 4 },
  ];

  it("returns pinned options when input is empty", () => {
    const result = buildVisibleOptions({ students: allStudents, pinnedOptions: pinned, inputValue: "" });
    assert.deepEqual(result, pinned);
  });

  it("returns pinned options when input is whitespace-only", () => {
    const result = buildVisibleOptions({ students: allStudents, pinnedOptions: pinned, inputValue: "   " });
    assert.deepEqual(result, pinned);
  });

  it("returns full student list when input has text", () => {
    const result = buildVisibleOptions({ students: allStudents, pinnedOptions: pinned, inputValue: "Bh" });
    assert.deepEqual(result, allStudents);
  });

  it("returns full student list when no pinnedOptions provided", () => {
    const result = buildVisibleOptions({ students: allStudents, pinnedOptions: null, inputValue: "" });
    assert.deepEqual(result, allStudents);
  });

  it("returns full student list when pinnedOptions is empty array", () => {
    const result = buildVisibleOptions({ students: allStudents, pinnedOptions: [], inputValue: "" });
    assert.deepEqual(result, allStudents);
  });
});

/**
 * PEP-223: StudentPicker scope logic tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveInitialState } from "../utils/studentPickerHelpers.js";

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

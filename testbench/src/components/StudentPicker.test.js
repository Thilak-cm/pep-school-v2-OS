/**
 * PEP-223: StudentPicker scope logic tests
 *
 * Tests the pure logic that maps scope/defaults props to behavior:
 * - Which students list to initialize with
 * - Whether "Load more" should be available
 * - Whether to fetch all students on mount
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveInitialState } from "../utils/studentPickerHelpers.js";

describe("StudentPicker — resolveInitialState", () => {
  describe('scope="hardcoded"', () => {
    it("uses provided defaults as student list", () => {
      const defaults = [{ id: "S1", displayName: "Student 1" }];
      const state = resolveInitialState({ scope: "hardcoded", defaults });
      assert.deepEqual(state.students, defaults);
      assert.equal(state.canLoadMore, false);
      assert.equal(state.shouldFetchAll, false);
    });

    it("uses empty array when no defaults provided", () => {
      const state = resolveInitialState({ scope: "hardcoded" });
      assert.deepEqual(state.students, []);
      assert.equal(state.canLoadMore, false);
    });
  });

  describe('scope="program"', () => {
    it("starts with empty list and enables load more", () => {
      const state = resolveInitialState({ scope: "program" });
      assert.deepEqual(state.students, []);
      assert.equal(state.canLoadMore, true);
      assert.equal(state.shouldFetchAll, false);
    });

    it("uses defaults if provided", () => {
      const defaults = [{ id: "S1", displayName: "A" }];
      const state = resolveInitialState({ scope: "program", defaults });
      assert.deepEqual(state.students, defaults);
      assert.equal(state.canLoadMore, true);
    });
  });

  describe('scope="school-wide"', () => {
    it("starts with empty list and signals fetch-all", () => {
      const state = resolveInitialState({ scope: "school-wide" });
      assert.deepEqual(state.students, []);
      assert.equal(state.canLoadMore, false);
      assert.equal(state.shouldFetchAll, true);
    });
  });

  describe("defaults to program scope", () => {
    it("treats unknown scope as program", () => {
      const state = resolveInitialState({});
      assert.equal(state.canLoadMore, true);
      assert.equal(state.shouldFetchAll, false);
    });
  });
});

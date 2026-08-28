import test from "node:test";
import assert from "node:assert/strict";

import {isGenericObservation} from "./studentHelpers.js";

test("generic AI observation readers exclude both assessment subtypes", () => {
  assert.equal(isGenericObservation({type: "text", text: "work"}), true);
  assert.equal(isGenericObservation({type: "lesson"}), true);
  assert.equal(isGenericObservation({type: "assessment", assessmentKind: "structured"}), false);
  assert.equal(isGenericObservation({type: "assessment", assessmentKind: "medical", uploadStatus: "ready"}), false);
  assert.equal(isGenericObservation({assessmentKind: "medical"}), false);
});

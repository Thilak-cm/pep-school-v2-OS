/**
 * PEP-216: Handwriting pipeline helper tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HANDWRITING_BLOCKS, buildStudentHeaderContent } from "./handwritingPipelineHelpers.js";

describe("HANDWRITING_BLOCKS", () => {
  it("defines exactly 5 blocks", () => {
    assert.equal(HANDWRITING_BLOCKS.length, 5);
  });

  it("has system prompt as block 1 in system section", () => {
    assert.equal(HANDWRITING_BLOCKS[0].number, "1");
    assert.equal(HANDWRITING_BLOCKS[0].section, "system");
    assert.equal(HANDWRITING_BLOCKS[0].source, "config");
  });

  it("has user prompt blocks 2-5 in user section", () => {
    for (let i = 1; i < 5; i++) {
      assert.equal(HANDWRITING_BLOCKS[i].section, "user");
    }
  });

  it("marks runtime blocks as source=runtime", () => {
    assert.equal(HANDWRITING_BLOCKS[2].source, "runtime"); // previous analysis
    assert.equal(HANDWRITING_BLOCKS[3].source, "runtime"); // annotations
    assert.equal(HANDWRITING_BLOCKS[4].source, "runtime"); // images
  });
});

describe("buildStudentHeaderContent", () => {
  it("returns null when student is null", () => {
    assert.equal(buildStudentHeaderContent(null), null);
  });

  it("returns formatted string with all fields", () => {
    const student = { displayName: "Aria", handwrittenCount: 9 };
    const result = buildStudentHeaderContent(student);
    assert.ok(result.includes("Student: Aria"));
    assert.ok(result.includes("Age: (resolved server-side from DOB)"));
    assert.ok(result.includes("Total writing samples: 9"));
  });

  it("omits handwrittenCount line when not provided", () => {
    const student = { displayName: "Aria" };
    const result = buildStudentHeaderContent(student);
    assert.ok(!result.includes("Total writing samples"));
    assert.ok(result.includes("Age: (resolved server-side from DOB)"));
  });
});

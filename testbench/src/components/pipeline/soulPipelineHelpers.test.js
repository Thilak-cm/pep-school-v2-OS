/**
 * PEP-216: Soul pipeline helper tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SOUL_BLOCKS, extractRolePreamble, extractOutputFormat, buildStudentContextContent } from "./soulPipelineHelpers.js";

describe("SOUL_BLOCKS", () => {
  it("defines exactly 7 blocks", () => {
    assert.equal(SOUL_BLOCKS.length, 7);
  });

  it("has 3 system blocks and 4 user blocks", () => {
    const system = SOUL_BLOCKS.filter((b) => b.section === "system");
    const user = SOUL_BLOCKS.filter((b) => b.section === "user");
    assert.equal(system.length, 3);
    assert.equal(user.length, 4);
  });

  it("marks observations, interviews, and previous soul as runtime", () => {
    assert.equal(SOUL_BLOCKS[4].source, "runtime"); // observations
    assert.equal(SOUL_BLOCKS[5].source, "runtime"); // interviews
    assert.equal(SOUL_BLOCKS[6].source, "runtime"); // previous soul
  });
});

describe("extractRolePreamble", () => {
  const MOCK_PROMPT = `You are an expert Montessori educator.

## Your guidelines

Some guidelines here.

## Output format

Produce a markdown document.`;

  it("returns null when systemPrompt is null", () => {
    assert.equal(extractRolePreamble(null), null);
  });

  it("extracts text before ## Your guidelines", () => {
    const result = extractRolePreamble(MOCK_PROMPT);
    assert.ok(result.includes("expert Montessori educator"));
    assert.ok(!result.includes("## Your guidelines"));
    assert.ok(!result.includes("Some guidelines"));
  });

  it("returns full prompt if ## Your guidelines is missing", () => {
    const noGuidelines = "You are an educator.\n\n## Output format\nProduce markdown.";
    assert.equal(extractRolePreamble(noGuidelines), noGuidelines);
  });
});

describe("extractOutputFormat", () => {
  const MOCK_PROMPT = `Preamble text.

## Your guidelines

Guidelines content.

## Output format

Produce a markdown document with headings.

## Emergent observations

At the very end.`;

  it("returns null when systemPrompt is null", () => {
    assert.equal(extractOutputFormat(null), null);
  });

  it("extracts everything from ## Output format onwards", () => {
    const result = extractOutputFormat(MOCK_PROMPT);
    assert.ok(result.startsWith("## Output format"));
    assert.ok(result.includes("Produce a markdown document"));
    assert.ok(result.includes("## Emergent observations"));
  });

  it("returns null if ## Output format marker is missing", () => {
    assert.equal(extractOutputFormat("Just a preamble."), null);
  });
});

describe("buildStudentContextContent", () => {
  it("returns null when student is null", () => {
    assert.equal(buildStudentContextContent(null), null);
  });

  it("returns JSON with studentName and id", () => {
    const result = buildStudentContextContent({ id: "s1", displayName: "Aria" });
    const parsed = JSON.parse(result);
    assert.equal(parsed.studentName, "Aria");
    assert.equal(parsed.id, "s1");
  });
});

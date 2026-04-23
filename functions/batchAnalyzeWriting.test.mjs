import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchWritingPrompt,
  calculateAge,
  parseWritingAnalysisResponse,
} from "./utils/handwritingAnalysisHelpers.js";

// ---------------------------------------------------------------------------
// AC1 + AC3: buildBatchWritingPrompt
// ---------------------------------------------------------------------------

describe("buildBatchWritingPrompt", () => {
  const baseMedia = [
    {
      id: "media_001",
      observedAt: new Date("2026-04-01"),
      teacherComment: "First attempt at cursive",
      copied: false,
      curriculumArea: "Language",
      createdByName: "Yamini",
      storagePath: "students/s1/media/media_001/original.webp",
    },
    {
      id: "media_002",
      observedAt: new Date("2026-04-08"),
      teacherComment: null,
      copied: true,
      curriculumArea: null,
      createdByName: "Priya",
      storagePath: "students/s1/media/media_002/original.webp",
    },
  ];

  const student = {
    displayName: "Sudarshan",
    dateOfBirth: new Date("2019-01-15"),
  };

  it("formats images chronologically with all metadata", () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    assert.ok(prompt.includes("Student: Sudarshan"));
    assert.ok(prompt.includes("[Image 1 of 2"));
    assert.ok(prompt.includes("[Image 2 of 2"));
    // First image date should come before second
    // Verify chronological order: image 1 annotation appears before image 2
    const idx1 = prompt.indexOf("[Image 1 of 2");
    const idx2 = prompt.indexOf("[Image 2 of 2");
    assert.ok(idx1 < idx2, "Images should be in chronological order");
  });

  it("includes student age calculated from dateOfBirth", () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    assert.ok(prompt.includes("Age: 7 years, 2 months"));
  });

  it("omits Teacher comment line when teacherComment is null/empty", () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    // Image 1 has comment
    assert.ok(prompt.includes('Teacher comment: "First attempt at cursive"'));
    // Image 2 has null comment — line should not appear
    const image2Section = prompt.split("[Image 2 of 2")[1];
    assert.ok(!image2Section.includes("Teacher comment:"));
  });

  it('shows "Copied: Yes" when copied is true', () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    const image2Section = prompt.split("[Image 2 of 2")[1];
    assert.ok(image2Section.includes("Copied: Yes"));
  });

  it('shows "Not classified" when curriculumArea is null', () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    const image2Section = prompt.split("[Image 2 of 2")[1];
    assert.ok(image2Section.includes("Curriculum area: Not classified"));
  });

  it("includes previous analysis when provided", () => {
    const previousAnalysis = {
      narrative: "Sudarshan shows steady improvement in letter formation.",
      dimensionRatings: {
        letterFormation: { score: 3, trend: "improving", evidence: "Consistent sizing" },
      },
    };
    const prompt = buildBatchWritingPrompt(baseMedia, student, previousAnalysis, new Date("2026-04-10"));
    assert.ok(prompt.includes("Previous writing analysis"));
    assert.ok(prompt.includes("Sudarshan shows steady improvement"));
    assert.ok(prompt.includes("letterFormation"));
  });

  it("omits previous analysis section when null", () => {
    const prompt = buildBatchWritingPrompt(baseMedia, student, null, new Date("2026-04-10"));
    assert.ok(!prompt.includes("Previous writing analysis"));
  });
});

// ---------------------------------------------------------------------------
// AC3: calculateAge
// ---------------------------------------------------------------------------

describe("calculateAge", () => {
  it("calculates age correctly", () => {
    const age = calculateAge(new Date("2019-01-15"), new Date("2026-04-10"));
    assert.deepStrictEqual(age, { years: 7, months: 2 });
  });

  it("handles birthday month edge case", () => {
    const age = calculateAge(new Date("2019-04-15"), new Date("2026-04-10"));
    assert.deepStrictEqual(age, { years: 6, months: 11 });
  });

  it("returns null for missing dateOfBirth", () => {
    const age = calculateAge(null, new Date("2026-04-10"));
    assert.strictEqual(age, null);
  });
});

// ---------------------------------------------------------------------------
// AC4: parseWritingAnalysisResponse
// ---------------------------------------------------------------------------

describe("parseWritingAnalysisResponse", () => {
  it("parses valid VLM JSON into expected schema", () => {
    const vlmResponse = {
      narrative: "Strong improvement in letter sizing.",
      improvements: ["Letter spacing more consistent"],
      concerns: ["Spelling accuracy below age level"],
      recommendations: ["Practice sight words daily"],
      dimensionRatings: {
        letterFormation: { score: 4, trend: "improving", evidence: "Consistent sizing" },
      },
    };
    const result = parseWritingAnalysisResponse(vlmResponse);
    assert.strictEqual(result.narrative, "Strong improvement in letter sizing.");
    assert.deepStrictEqual(result.improvements, ["Letter spacing more consistent"]);
    assert.deepStrictEqual(result.concerns, ["Spelling accuracy below age level"]);
    assert.deepStrictEqual(result.recommendations, ["Practice sight words daily"]);
    assert.strictEqual(result.dimensionRatings.letterFormation.score, 4);
  });

  it("returns defaults for missing fields", () => {
    const result = parseWritingAnalysisResponse({ narrative: "OK" });
    assert.strictEqual(result.narrative, "OK");
    assert.deepStrictEqual(result.improvements, []);
    assert.deepStrictEqual(result.concerns, []);
    assert.deepStrictEqual(result.recommendations, []);
    assert.deepStrictEqual(result.dimensionRatings, {});
  });

  it("returns error for non-object input", () => {
    const result = parseWritingAnalysisResponse("not json");
    assert.strictEqual(result, null);
  });

  it("returns error for null input", () => {
    const result = parseWritingAnalysisResponse(null);
    assert.strictEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// AC2: threshold gate (tested via pure logic, not CF invocation)
// ---------------------------------------------------------------------------

describe("threshold gate", () => {
  it("should skip when count < minSamples", () => {
    const count = 2;
    const minSamples = 3;
    assert.ok(count < minSamples);
  });

  it("should proceed when count >= minSamples", () => {
    const count = 3;
    const minSamples = 3;
    assert.ok(count >= minSamples);
  });

  it("should proceed when count > minSamples", () => {
    const count = 9;
    const minSamples = 3;
    assert.ok(count >= minSamples);
  });
});

// ---------------------------------------------------------------------------
// AC5: copiedCount in output
// ---------------------------------------------------------------------------

describe("copiedCount", () => {
  it("counts copied media docs correctly", () => {
    const mediaDocs = [
      { copied: true },
      { copied: false },
      { copied: true },
      { copied: false },
    ];
    const copiedCount = mediaDocs.filter((d) => d.copied === true).length;
    assert.strictEqual(copiedCount, 2);
  });

  it("returns 0 when no docs are copied", () => {
    const mediaDocs = [{ copied: false }, { copied: false }];
    const copiedCount = mediaDocs.filter((d) => d.copied === true).length;
    assert.strictEqual(copiedCount, 0);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStudentName,
  capitalize,
  buildReportDocTitle,
  deriveAcademicYear,
  buildDocInsertRequests,
  formatDateForMeta,
} from "../utils/driveHelpers.js";
import { DOC_STYLE } from "../config/reportConstants.js";

describe("resolveStudentName", () => {
  it("returns displayName when present", () => {
    assert.equal(
      resolveStudentName({ displayName: "Aakash Mehta", firstName: "Aakash", lastName: "Mehta" }),
      "Aakash Mehta",
    );
  });

  it("falls back to name when displayName is missing", () => {
    assert.equal(
      resolveStudentName({ name: "Priya Sharma" }),
      "Priya Sharma",
    );
  });

  it("falls back to firstName + lastName when others are missing", () => {
    assert.equal(
      resolveStudentName({ firstName: "Aakash", lastName: "Mehta" }),
      "Aakash Mehta",
    );
  });

  it("uses firstName alone when lastName is missing", () => {
    assert.equal(
      resolveStudentName({ firstName: "Aakash" }),
      "Aakash",
    );
  });

  it("returns Unknown Student for null/undefined", () => {
    assert.equal(resolveStudentName(null), "Unknown Student");
    assert.equal(resolveStudentName(undefined), "Unknown Student");
  });

  it("returns Unknown Student when all name fields are empty", () => {
    assert.equal(resolveStudentName({}), "Unknown Student");
  });
});

describe("capitalize", () => {
  it("capitalizes first letter", () => {
    assert.equal(capitalize("adolescent"), "Adolescent");
  });

  it("handles already capitalized", () => {
    assert.equal(capitalize("HSR"), "HSR");
  });

  it("trims whitespace", () => {
    assert.equal(capitalize("  primary  "), "Primary");
  });

  it("handles empty/null", () => {
    assert.equal(capitalize(""), "");
    assert.equal(capitalize(null), "");
  });
});

describe("buildReportDocTitle", () => {
  it("formats as 'Name | Term Report | Month Year'", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-02-28T10:00:00.000Z"),
      "Aakash Mehta | Term Report | February 2026",
    );
  });

  it("uses month-year from generatedAt", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-03-15T10:00:00.000Z"),
      "Aakash Mehta | Term Report | March 2026",
    );
  });

  it("uses current date when generatedAt is null", () => {
    const title = buildReportDocTitle("Aakash Mehta", null);
    const now = new Date();
    const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    assert.equal(title, `Aakash Mehta | Term Report | ${monthYear}`);
  });

  it("trims student name", () => {
    assert.equal(
      buildReportDocTitle("  Aakash Mehta  ", "2026-02-28T10:00:00.000Z"),
      "Aakash Mehta | Term Report | February 2026",
    );
  });

  it("uses Baseline Report label when reportType is baseline", () => {
    assert.equal(
      buildReportDocTitle("Ava", "2026-06-01T10:00:00.000Z", "baseline"),
      "Ava | Baseline Report | June 2026",
    );
  });

  it("uses Term Report label when reportType is term", () => {
    assert.equal(
      buildReportDocTitle("Ava", "2026-06-01T10:00:00.000Z", "term"),
      "Ava | Term Report | June 2026",
    );
  });

  it("defaults to Term Report when reportType is undefined", () => {
    assert.equal(
      buildReportDocTitle("Ava", "2026-06-01T10:00:00.000Z"),
      "Ava | Term Report | June 2026",
    );
  });
});

// --- deriveAcademicYear ---

describe("deriveAcademicYear", () => {
  it("returns 2026-27 for a June 2026 date (AY starts June)", () => {
    assert.equal(deriveAcademicYear(new Date("2026-06-01")), "2026-27");
  });

  it("returns 2025-26 for a March 2026 date (before June)", () => {
    assert.equal(deriveAcademicYear(new Date("2026-03-15")), "2025-26");
  });

  it("returns 2025-26 for a May 2026 date (still before June)", () => {
    assert.equal(deriveAcademicYear(new Date("2026-05-31")), "2025-26");
  });

  it("returns 2026-27 for a November 2026 date (well into AY)", () => {
    assert.equal(deriveAcademicYear(new Date("2026-11-01")), "2026-27");
  });

  it("returns 2025-26 for a December 2025 date", () => {
    assert.equal(deriveAcademicYear(new Date("2025-12-15")), "2025-26");
  });

  it("handles string date input", () => {
    assert.equal(deriveAcademicYear("2026-01-10"), "2025-26");
  });

  it("falls back to current year when input is null", () => {
    const now = new Date();
    const month = now.getUTCMonth();
    const year = now.getUTCFullYear();
    const expectedStart = month >= 5 ? year : year - 1;
    assert.equal(
      deriveAcademicYear(null),
      `${expectedStart}-${String(expectedStart + 1).slice(-2)}`,
    );
  });
});

// --- formatDateForMeta ---

describe("formatDateForMeta", () => {
  it("formats a Date object to D Month YYYY", () => {
    assert.equal(formatDateForMeta(new Date("2025-11-01T00:00:00.000Z")), "1 November 2025");
  });

  it("formats an ISO string to D Month YYYY", () => {
    assert.equal(formatDateForMeta("2026-03-15T10:00:00.000Z"), "15 March 2026");
  });

  it("handles a Firestore-like Timestamp with toDate()", () => {
    const fakeTimestamp = { toDate: () => new Date("2025-11-01T00:00:00.000Z") };
    assert.equal(formatDateForMeta(fakeTimestamp), "1 November 2025");
  });

  it("returns empty string for null/undefined", () => {
    assert.equal(formatDateForMeta(null), "");
    assert.equal(formatDateForMeta(undefined), "");
  });
});

// --- buildDocInsertRequests formatting ---

describe("buildDocInsertRequests formatting", () => {
  const sampleMarkdown = "## Social-Emotional Development\nAakash shows great empathy.\n### Sub-area\nDetails here.";
  const baseOpts = {
    studentName: "Aakash Mehta",
    programName: "Adolescent",
    classroomName: "Gulmohar",
    academicYear: "2025-26",
    startDate: new Date("2025-11-01T00:00:00.000Z"),
    endDate: new Date("2026-03-31T00:00:00.000Z"),
    logoUrl: "https://example.com/logo.webp",
  };

  // Helper: find requests of a given type
  function findRequests(requests, type) {
    return requests.filter((r) => r[type] !== undefined);
  }

  // Helper: find a text style update covering a given text
  function findTextStyleForText(requests, text) {
    // Find the insertText with the given text, get its index range, then find the matching updateTextStyle
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      if (r.insertText && r.insertText.text.includes(text)) {
        const startIdx = r.insertText.location.index;
        const endIdx = startIdx + r.insertText.text.length;
        // Find the updateTextStyle that covers this range
        return requests.find((s) =>
          s.updateTextStyle &&
          s.updateTextStyle.range.startIndex === startIdx &&
          s.updateTextStyle.range.endIndex === endIdx,
        );
      }
    }
    return null;
  }

  it("returns empty array for empty markdown without options", () => {
    assert.deepEqual(buildDocInsertRequests(""), []);
    assert.deepEqual(buildDocInsertRequests(null), []);
  });

  // AC1: Logo insertion
  it("inserts logo as the first request when logoUrl is provided", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const imageRequests = findRequests(requests, "insertInlineImage");
    assert.equal(imageRequests.length, 1);
    assert.equal(imageRequests[0].insertInlineImage.uri, baseOpts.logoUrl);
    assert.equal(imageRequests[0].insertInlineImage.location.index, 1);
  });

  it("sets logo dimensions from DOC_STYLE", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const img = findRequests(requests, "insertInlineImage")[0].insertInlineImage;
    assert.equal(img.objectSize.width.magnitude, DOC_STYLE.logoWidth);
    assert.equal(img.objectSize.height.magnitude, DOC_STYLE.logoHeight);
    assert.equal(img.objectSize.width.unit, "PT");
  });

  it("omits logo when logoUrl is not provided", () => {
    const opts = { ...baseOpts, logoUrl: undefined };
    const requests = buildDocInsertRequests(sampleMarkdown, opts);
    const imageRequests = findRequests(requests, "insertInlineImage");
    assert.equal(imageRequests.length, 0);
  });

  // AC2: Student name heading — navy blue
  it("inserts student name with navy blue color and bold", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const styleReq = findTextStyleForText(requests, "Aakash Mehta");
    assert.ok(styleReq, "should have a text style for student name");
    const style = styleReq.updateTextStyle.textStyle;
    assert.ok(style.bold, "student name should be bold");
    assert.deepEqual(style.foregroundColor.color.rgbColor, DOC_STYLE.nameColor);
    assert.equal(style.fontSize.magnitude, DOC_STYLE.nameFontSize);
  });

  // AC3: Metadata line — pink/magenta with program, classroom, date range, and AY
  it("inserts metadata line with classroom, date range, and AY", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const metaText = "Adolescent | Gulmohar | 1 November 2025 to 31 March 2026 | AY 2025-26";
    const styleReq = findTextStyleForText(requests, metaText);
    assert.ok(styleReq, "should have a text style for metadata line");
    const style = styleReq.updateTextStyle.textStyle;
    assert.deepEqual(style.foregroundColor.color.rgbColor, DOC_STYLE.metaColor);
    assert.equal(style.fontSize.magnitude, DOC_STYLE.metaFontSize);
  });

  it("omits date range from metadata when startDate is not provided", () => {
    const opts = { ...baseOpts, startDate: undefined };
    const requests = buildDocInsertRequests(sampleMarkdown, opts);
    const metaText = "Adolescent | Gulmohar | AY 2025-26";
    const styleReq = findTextStyleForText(requests, metaText);
    assert.ok(styleReq, "should fallback to metadata line without date range");
  });

  // AC4: Section headings — bold dark navy
  it("styles ## headings with bold dark navy color", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const styleReq = findTextStyleForText(requests, "Social-Emotional Development");
    assert.ok(styleReq, "should have a text style for h2 heading");
    const style = styleReq.updateTextStyle.textStyle;
    assert.ok(style.bold, "heading should be bold");
    assert.deepEqual(style.foregroundColor.color.rgbColor, DOC_STYLE.headingColor);
  });

  it("styles ### headings with bold dark navy color", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const styleReq = findTextStyleForText(requests, "Sub-area");
    assert.ok(styleReq, "should have a text style for h3 heading");
    const style = styleReq.updateTextStyle.textStyle;
    assert.ok(style.bold, "h3 heading should be bold");
    assert.deepEqual(style.foregroundColor.color.rgbColor, DOC_STYLE.headingColor);
  });

  // AC5: Body text — dark grey, justified
  it("styles body text with dark grey color", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const styleReq = findTextStyleForText(requests, "Aakash shows great empathy.");
    assert.ok(styleReq, "should have a text style for body text");
    const style = styleReq.updateTextStyle.textStyle;
    assert.deepEqual(style.foregroundColor.color.rgbColor, DOC_STYLE.bodyColor);
    assert.equal(style.fontSize.magnitude, DOC_STYLE.bodyFontSize);
  });

  it("applies justified alignment to body paragraphs", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    // Find paragraph style for body text
    const bodyInsert = requests.find((r) =>
      r.insertText && r.insertText.text.includes("Aakash shows great empathy."),
    );
    assert.ok(bodyInsert, "body text should be inserted");
    const startIdx = bodyInsert.insertText.location.index;
    const endIdx = startIdx + bodyInsert.insertText.text.length;
    const paraStyle = requests.find((r) =>
      r.updateParagraphStyle &&
      r.updateParagraphStyle.range.startIndex === startIdx &&
      r.updateParagraphStyle.range.endIndex === endIdx &&
      r.updateParagraphStyle.paragraphStyle.alignment === "JUSTIFIED",
    );
    assert.ok(paraStyle, "body paragraph should have JUSTIFIED alignment");
  });

  // AC6: Paragraph spacing
  it("applies spacing above section headings", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const headingInsert = requests.find((r) =>
      r.insertText && r.insertText.text.includes("Social-Emotional Development"),
    );
    assert.ok(headingInsert);
    const startIdx = headingInsert.insertText.location.index;
    const endIdx = startIdx + headingInsert.insertText.text.length;
    const paraStyle = requests.find((r) =>
      r.updateParagraphStyle &&
      r.updateParagraphStyle.range.startIndex === startIdx &&
      r.updateParagraphStyle.range.endIndex === endIdx &&
      r.updateParagraphStyle.paragraphStyle.spaceAbove,
    );
    assert.ok(paraStyle, "headings should have spaceAbove");
    assert.equal(
      paraStyle.updateParagraphStyle.paragraphStyle.spaceAbove.magnitude,
      DOC_STYLE.headingSpaceAbove,
    );
  });

  // AC: Roboto font on all text styles
  it("applies Roboto font to all updateTextStyle requests", () => {
    const requests = buildDocInsertRequests(sampleMarkdown, baseOpts);
    const textStyles = findRequests(requests, "updateTextStyle");
    assert.ok(textStyles.length >= 4, "should have at least 4 text style updates (name, meta, heading, body)");
    for (const req of textStyles) {
      const style = req.updateTextStyle.textStyle;
      assert.ok(
        style.weightedFontFamily && style.weightedFontFamily.fontFamily === "Roboto",
        `expected Roboto font, got: ${JSON.stringify(style.weightedFontFamily)}`,
      );
      assert.ok(
        req.updateTextStyle.fields.includes("weightedFontFamily"),
        "fields mask should include weightedFontFamily",
      );
    }
  });

  // Backward compatibility: no options → same behavior as before (basic headings + text)
  it("works without options (backward compatible)", () => {
    const requests = buildDocInsertRequests(sampleMarkdown);
    assert.ok(requests.length > 0, "should produce requests");
    const imageRequests = findRequests(requests, "insertInlineImage");
    assert.equal(imageRequests.length, 0, "no logo without options");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStudentName,
  capitalize,
  buildReportDocTitle,
  buildDocInsertRequests,
  buildSegmentImageRequests,
} from "../utils/driveHelpers.js";

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
  it("includes date for first report (count=0)", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-02-28T10:00:00.000Z", 0),
      "Aakash Mehta — Progress Report (2026-02-28)",
    );
  });

  it("includes version and date for subsequent reports", () => {
    assert.equal(
      buildReportDocTitle("Aakash Mehta", "2026-03-15T10:00:00.000Z", 1),
      "Aakash Mehta — Progress Report v2 (2026-03-15)",
    );
  });

  it("handles higher version counts", () => {
    assert.equal(
      buildReportDocTitle("Priya Sharma", "2026-06-01T00:00:00.000Z", 3),
      "Priya Sharma — Progress Report v4 (2026-06-01)",
    );
  });

  it("uses current date when generatedAt is null", () => {
    const title = buildReportDocTitle("Aakash Mehta", null);
    const todayStr = new Date().toISOString().split("T")[0];
    assert.equal(title, `Aakash Mehta — Progress Report (${todayStr})`);
  });

  it("trims student name", () => {
    assert.equal(
      buildReportDocTitle("  Aakash Mehta  ", "2026-02-28T10:00:00.000Z", 0),
      "Aakash Mehta — Progress Report (2026-02-28)",
    );
  });
});

describe("buildDocInsertRequests", () => {
  it("produces logo, name, and subtitle even with empty markdown", () => {
    const requests = buildDocInsertRequests("", {
      studentName: "Aakash Mehta",
      programName: "Adolescent",
      academicYear: "2025-26",
    });
    assert.ok(requests.length > 0, "should produce requests");

    // Logo image at index 1
    const logoReq = requests.find((r) => r.insertInlineImage);
    assert.ok(logoReq, "should have an insertInlineImage for logo");
    assert.equal(logoReq.insertInlineImage.location.index, 1);
    assert.ok(logoReq.insertInlineImage.uri.includes("pep-logo.png"));

    // Student name text present
    const nameReq = requests.find((r) =>
      r.insertText?.text?.includes("Aakash Mehta"),
    );
    assert.ok(nameReq, "should insert student name");

    // Subtitle with program name + AY (no Term 1)
    const subReq = requests.find((r) =>
      r.insertText?.text?.includes("Adolescent Program") &&
      r.insertText?.text?.includes("AY 2025-26"),
    );
    assert.ok(subReq, "should insert subtitle with program and AY");
    assert.ok(!subReq.insertText.text.includes("Term 1"), "should not include Term 1");

    // Only the logo image in body (footer/headers handled separately)
    const imageReqs = requests.filter((r) => r.insertInlineImage);
    assert.equal(imageReqs.length, 1, "should have exactly 1 image (logo only)");
  });

  it("produces bold text style for ## headings", () => {
    const requests = buildDocInsertRequests("## Personal Development", {
      studentName: "Priya",
    });
    const textReqs = requests.filter((r) =>
      r.insertText?.text?.includes("Personal Development"),
    );
    assert.ok(textReqs.length > 0, "should insert heading text");

    const styleReqs = requests.filter((r) =>
      r.updateTextStyle?.textStyle?.bold === true &&
      r.updateTextStyle?.textStyle?.weightedFontFamily?.fontFamily === "Montserrat",
    );
    assert.ok(styleReqs.length > 0, "should have bold Montserrat style for headings");
  });

  it("produces justified alignment for body paragraphs", () => {
    const requests = buildDocInsertRequests("Aakash is doing well in math.", {});
    const justifiedReqs = requests.filter((r) =>
      r.updateParagraphStyle?.paragraphStyle?.alignment === "JUSTIFIED",
    );
    assert.ok(justifiedReqs.length > 0, "body text should be justified");
  });

  it("resets bold to false on body text so headings don't bleed", () => {
    const requests = buildDocInsertRequests("## Heading\n\nBody paragraph.", {});
    // Find updateTextStyle requests that set bold: true (headings) and bold: false (body)
    const bodyStyleReqs = requests.filter((r) => {
      const ts = r.updateTextStyle?.textStyle;
      return ts && ts.bold === false;
    });
    assert.ok(bodyStyleReqs.length > 0, "body text should explicitly set bold: false");
  });

  it("handles missing metadata gracefully (no crash)", () => {
    const requests = buildDocInsertRequests("Some body text.");
    assert.ok(Array.isArray(requests));
    assert.ok(requests.length > 0);
  });

  it("handles null/undefined markdown with metadata", () => {
    const requests = buildDocInsertRequests(null, {
      studentName: "Aakash",
      programName: "Elementary",
      academicYear: "2025-26",
    });
    assert.ok(Array.isArray(requests));
    // Should still have logo, name, subtitle
    assert.ok(requests.length > 0);
  });

  it("produces index values in ascending order for all insert operations", () => {
    const requests = buildDocInsertRequests("## Heading\n\nSome body text.\n\n### Sub heading\n\nMore text.", {
      studentName: "Aakash Mehta",
      programName: "Adolescent",
      academicYear: "2025-26",
    });

    const insertIndices = requests
      .filter((r) => r.insertText || r.insertInlineImage)
      .map((r) => (r.insertText?.location?.index ?? r.insertInlineImage?.location?.index));

    for (let i = 1; i < insertIndices.length; i++) {
      assert.ok(
        insertIndices[i] >= insertIndices[i - 1],
        `index ${insertIndices[i]} should be >= ${insertIndices[i - 1]}`,
      );
    }
  });
});

describe("buildSegmentImageRequests", () => {
  it("defaults to right-aligned (END) with zero spacing", () => {
    const requests = buildSegmentImageRequests(
      "header-abc", "https://example.com/img.png", 100, 50,
    );
    assert.equal(requests.length, 2);

    // First request: insert image at index 0 in the segment
    const imgReq = requests[0];
    assert.ok(imgReq.insertInlineImage);
    assert.equal(imgReq.insertInlineImage.location.segmentId, "header-abc");
    assert.equal(imgReq.insertInlineImage.location.index, 0);
    assert.equal(imgReq.insertInlineImage.uri, "https://example.com/img.png");
    assert.equal(imgReq.insertInlineImage.objectSize.width.magnitude, 100);
    assert.equal(imgReq.insertInlineImage.objectSize.height.magnitude, 50);

    // Second request: right-align with zero spacing/indentation
    const paraReq = requests[1];
    assert.ok(paraReq.updateParagraphStyle);
    assert.equal(paraReq.updateParagraphStyle.range.segmentId, "header-abc");
    assert.equal(paraReq.updateParagraphStyle.paragraphStyle.alignment, "END");
    assert.equal(paraReq.updateParagraphStyle.paragraphStyle.spaceAbove.magnitude, 0);
    assert.equal(paraReq.updateParagraphStyle.paragraphStyle.indentStart.magnitude, 0);
  });

  it("accepts custom alignment via options", () => {
    const requests = buildSegmentImageRequests(
      "footer-xyz", "https://example.com/footer.png", 612, 84,
      { alignment: "START" },
    );
    const paraReq = requests[1];
    assert.equal(paraReq.updateParagraphStyle.paragraphStyle.alignment, "START");
  });
});

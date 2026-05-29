/**
 * PEP-279: Google Docs content builders for monthly plan export.
 *
 * Pure functions that convert plan JSON into Google Docs API batchUpdate
 * request arrays. Two doc types:
 *   1. Detailed Plan — rationale-focused coaching doc for teacher reflection
 *   2. Task Checklist — two-column printable (tasks left, blank space right)
 *
 * No Drive/Docs API calls — just data transforms.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT = "Roboto";

/** Section label colors (muted, professional). RGB fractions 0–1. */
const SECTION_COLORS = {
  "Language": { red: 79 / 255, green: 70 / 255, blue: 229 / 255 },      // #4f46e5
  "Sensorial": { red: 13 / 255, green: 148 / 255, blue: 136 / 255 },    // #0d9488
  "Math": { red: 217 / 255, green: 119 / 255, blue: 6 / 255 },          // #d97706
  "Practical Life": { red: 225 / 255, green: 29 / 255, blue: 72 / 255 }, // #e11d48
  "Grace & Courtesy": { red: 124 / 255, green: 58 / 255, blue: 237 / 255 }, // #7c3aed
};
const DEFAULT_SECTION_COLOR = { red: 51 / 255, green: 51 / 255, blue: 51 / 255 };

/** Shared style constants */
const STYLE = {
  // Header
  headerMetaSize: 8,
  studentNameSize: 16,

  // Detailed plan
  sectionHeadingSize: 14,
  rationaleSize: 9,
  itemTitleSize: 11,
  itemLabelSize: 8,
  itemBodySize: 9,
  // Checklist
  checklistSectionSize: 9,

  checklistFooterSize: 8,
  // Colors
  bodyColor: { red: 51 / 255, green: 51 / 255, blue: 51 / 255 },
  lightGray: { red: 120 / 255, green: 120 / 255, blue: 120 / 255 },
  labelColor: { red: 13 / 255, green: 71 / 255, blue: 161 / 255 }, // #0D47A1
  rationaleBg: { red: 245 / 255, green: 245 / 255, blue: 245 / 255 },
};

// ---------------------------------------------------------------------------
// Public: title builders
// ---------------------------------------------------------------------------

/**
 * Convert "2026-06" to "June 2026".
 */
export function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function buildPlanDocTitle(studentName, month) {
  return `${studentName} | Monthly Plan | ${formatMonthLabel(month)}`;
}

export function buildChecklistDocTitle(studentName, month) {
  return `${studentName} | Task Checklist | ${formatMonthLabel(month)}`;
}

// ---------------------------------------------------------------------------
// Public: Detailed plan doc
// ---------------------------------------------------------------------------

/**
 * Build Google Docs batchUpdate requests for the detailed plan doc.
 *
 * Layout (per the May 25 PDF reference):
 *   Header: "{CLASSROOM} · CHILD {NN}" / Student name + code / data window meta
 *   Per section:
 *     Section heading
 *     RATIONALE block (position + monthlyAim, gray background)
 *     Items 1–5, each with all 7 fields:
 *       work (title) → WHY → SUCCESS → NEXT → HOOK → BASIS → HOW TO OFFER (de-emphasized)
 *
 * @param {object} plan - The plan JSON from Firestore
 * @param {object} meta - { classroomName, studentCode, childNumber }
 * @returns {Array} Google Docs API batchUpdate requests
 */
export function buildDetailedPlanRequests(plan, meta) {
  const requests = [];
  let idx = 1;

  const ins = (text) => {
    requests.push({ insertText: { location: { index: idx }, text } });
    const len = text.length;
    return { start: idx, end: idx + len, advance: () => { idx += len; } };
  };

  const style = (start, end, textStyle, fields = "fontSize,foregroundColor,weightedFontFamily") => {
    requests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end },
        textStyle,
        fields,
      },
    });
  };

  const paraStyle = (start, end, paragraphStyle, fields) => {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle,
        fields,
      },
    });
  };

  // ── Header ──────────────────────────────────────────────────────────────

  // Line 1: "{CLASSROOM}"
  const classroomUpper = (meta.classroomName || "").toUpperCase();
  const headerLine1 = `${classroomUpper}\n`;
  const h1 = ins(headerLine1);
  h1.advance();
  style(h1.start, h1.end, {
    fontSize: { magnitude: STYLE.headerMetaSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
    smallCaps: true,
  }, "fontSize,foregroundColor,weightedFontFamily,smallCaps");

  // Line 2: Student name (no code badge)
  const nameLine = `${plan.studentName}\n`;
  const nl = ins(nameLine);
  nl.advance();
  style(nl.start, nl.end, {
    bold: true,
    fontSize: { magnitude: STYLE.studentNameSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");

  // Line 3: Data window meta
  const dw = plan.dataWindow || {};
  const ageNote = plan.age ? `Developmental note: ${plan.age} old` : "";
  const metaParts = [
    dw.from && dw.to ? `Data window: ${dw.from} to ${dw.to}` : "",
    dw.observationCount != null ? `Observation count: ${dw.observationCount}` : "",
    ageNote,
  ].filter(Boolean);
  const metaLine = metaParts.join("  ·  ") + "\n\n";
  const ml = ins(metaLine);
  ml.advance();
  style(ml.start, ml.end, {
    fontSize: { magnitude: STYLE.headerMetaSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
  });

  // ── Sections ────────────────────────────────────────────────────────────

  for (const section of (plan.sections || [])) {
    const sectionColor = SECTION_COLORS[section.name] || DEFAULT_SECTION_COLOR;

    // Section heading
    const headingText = `${section.name}\n`;
    const sh = ins(headingText);
    sh.advance();
    style(sh.start, sh.end, {
      bold: true,
      fontSize: { magnitude: STYLE.sectionHeadingSize, unit: "PT" },
      foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
      weightedFontFamily: { fontFamily: FONT },
    }, "bold,fontSize,foregroundColor,weightedFontFamily");
    paraStyle(sh.start, sh.end, {
      spaceAbove: { magnitude: 16, unit: "PT" },
      spaceBelow: { magnitude: 6, unit: "PT" },
    }, "spaceAbove,spaceBelow");

    // RATIONALE block (section-level position + monthlyAim)
    const rationaleContent = [section.position, section.monthlyAim].filter(Boolean).join(" ");
    if (rationaleContent) {
      const ratLabel = "RATIONALE  ";
      const ratText = rationaleContent + "\n";
      const fullRat = ratLabel + ratText;
      const rr = ins(fullRat);
      rr.advance();
      // Label styling (bold, blue)
      style(rr.start, rr.start + ratLabel.length, {
        bold: true,
        fontSize: { magnitude: STYLE.rationaleSize, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.labelColor } },
        weightedFontFamily: { fontFamily: FONT },
      }, "bold,fontSize,foregroundColor,weightedFontFamily");
      // Body styling (normal, gray)
      style(rr.start + ratLabel.length, rr.end, {
        fontSize: { magnitude: STYLE.rationaleSize, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
        weightedFontFamily: { fontFamily: FONT },
      });
      // Gray background shading for the rationale paragraph
      paraStyle(rr.start, rr.end, {
        shading: { backgroundColor: { color: { rgbColor: STYLE.rationaleBg } } },
        indentStart: { magnitude: 18, unit: "PT" },
        indentEnd: { magnitude: 18, unit: "PT" },
        spaceAbove: { magnitude: 8, unit: "PT" },
        spaceBelow: { magnitude: 12, unit: "PT" },
      }, "shading,indentStart,indentEnd,spaceAbove,spaceBelow");
    }

    // Items
    const items = section.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Numbered work title: "1. Re-present Sandpaper Letters..."
      const itemTitle = `${i + 1}. ${item.work}\n`;
      const it = ins(itemTitle);
      it.advance();
      style(it.start, it.end, {
        bold: false,
        fontSize: { magnitude: STYLE.itemTitleSize, unit: "PT" },
        foregroundColor: { color: { rgbColor: sectionColor } },
        weightedFontFamily: { fontFamily: FONT },
      }, "bold,fontSize,foregroundColor,weightedFontFamily");
      paraStyle(it.start, it.end, {
        spaceAbove: { magnitude: 10, unit: "PT" },
        indentStart: { magnitude: 18, unit: "PT" },
        borderLeft: {
          color: { color: { rgbColor: sectionColor } },
          width: { magnitude: 2, unit: "PT" },
          padding: { magnitude: 8, unit: "PT" },
          dashStyle: "SOLID",
        },
      }, "spaceAbove,indentStart,borderLeft");

      // Field labels and values — all 7 fields
      const fields = [
        { label: "WHY", value: item.why },
        { label: "SUCCESS", value: item.watch },
        { label: "NEXT", value: item.next },
        { label: "HOOK", value: item.hook },
        { label: "BASIS", value: item.basis },
        { label: "HOW TO OFFER", value: item.offer, deemphasize: true },
      ];

      for (const field of fields) {
        if (!field.value) continue;
        const labelText = `${field.label}  `;
        const valueText = `${field.value}\n`;
        const fullField = labelText + valueText;
        const ff = ins(fullField);
        ff.advance();
        // Label: bold, blue, small
        style(ff.start, ff.start + labelText.length, {
          bold: true,
          fontSize: { magnitude: STYLE.itemLabelSize, unit: "PT" },
          foregroundColor: { color: { rgbColor: STYLE.labelColor } },
          weightedFontFamily: { fontFamily: FONT },
        }, "bold,fontSize,foregroundColor,weightedFontFamily");
        // Value: normal (or italic + smaller + gray when deemphasized)
        style(ff.start + labelText.length, ff.end, {
          bold: false,
          italic: !!field.deemphasize,
          fontSize: { magnitude: field.deemphasize ? 7 : STYLE.itemBodySize, unit: "PT" },
          foregroundColor: { color: { rgbColor: field.deemphasize ? STYLE.lightGray : STYLE.bodyColor } },
          weightedFontFamily: { fontFamily: FONT },
        }, "bold,italic,fontSize,foregroundColor,weightedFontFamily");
        // Left border continuation + indent
        paraStyle(ff.start, ff.end, {
          indentStart: { magnitude: 18, unit: "PT" },
          borderLeft: {
            color: { color: { rgbColor: sectionColor } },
            width: { magnitude: 2, unit: "PT" },
            padding: { magnitude: 8, unit: "PT" },
            dashStyle: "SOLID",
          },
          spaceBelow: { magnitude: 2, unit: "PT" },
        }, "indentStart,borderLeft,spaceBelow");
      }
    }
  }

  return requests;
}

// ---------------------------------------------------------------------------
// Public: Task checklist doc
// ---------------------------------------------------------------------------

/**
 * Build Google Docs batchUpdate requests for the task checklist doc.
 *
 * Layout (page-level two-column):
 *   Header: Student name + code + classroom + month
 *   Body: Single two-column table
 *     Left column: All 5 sections stacked — section name + checkbox items
 *     Right column: One big blank area for teacher handwritten notes
 *   Footer: Reference to companion detailed plan doc
 *
 * @param {object} plan - The plan JSON from Firestore
 * @param {object} meta - { classroomName, studentCode, childNumber }
 * @returns {Array} Google Docs API batchUpdate requests
 */
export function buildChecklistRequests(plan, meta) {
  const requests = [];
  let idx = 1;

  const ins = (text) => {
    requests.push({ insertText: { location: { index: idx }, text } });
    const len = text.length;
    return { start: idx, end: idx + len, advance: () => { idx += len; } };
  };

  const style = (start, end, textStyle, fields = "fontSize,foregroundColor,weightedFontFamily") => {
    requests.push({
      updateTextStyle: {
        range: { startIndex: start, endIndex: end },
        textStyle,
        fields,
      },
    });
  };

  const paraStyle = (start, end, paragraphStyle, fields) => {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: start, endIndex: end },
        paragraphStyle,
        fields,
      },
    });
  };

  // ── Header ──────────────────────────────────────────────────────────────

  // Single row: "Student Name   CLASSROOM · Month YYYY"
  const monthLabel = formatMonthLabel(plan.month);
  const studentName = plan.studentName || "";
  const classroomMonth = `  ${(meta.classroomName || "").toUpperCase()} · ${monthLabel}`;
  const headerLine = `${studentName}${classroomMonth}\n`;
  const hl = ins(headerLine);
  hl.advance();
  // Student name: bold 14pt dark
  style(hl.start, hl.start + studentName.length, {
    bold: true,
    fontSize: { magnitude: 14, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");
  // Classroom · month: smaller, gray, inline after name
  style(hl.start + studentName.length, hl.end - 1, {
    bold: false,
    fontSize: { magnitude: 9, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
    smallCaps: true,
  }, "bold,fontSize,foregroundColor,weightedFontFamily,smallCaps");
  paraStyle(hl.start, hl.end, {
    spaceBelow: { magnitude: 4, unit: "PT" },
  }, "spaceBelow");

  // Column headers: "Checklist" left-aligned, "Teacher Comments →" right-aligned
  // Right-aligned text sits at the right edge of the content area (= at the divider)
  const colHeaderLine = "Checklist | Teacher Comments →\n";
  const clChecklistEnd = "Checklist".length;
  const cl = ins(colHeaderLine);
  cl.advance();
  style(cl.start, cl.start + clChecklistEnd, {
    bold: true,
    fontSize: { magnitude: 8, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");
  // Spaces + "Teacher Comments →" in same style
  style(cl.start + clChecklistEnd, cl.end, {
    bold: true,
    fontSize: { magnitude: 8, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");
  paraStyle(cl.start, cl.end, {
    spaceBelow: { magnitude: 6, unit: "PT" },
  }, "spaceBelow");

  // ── Checklist body ───────────────────────────────────────────────────────
  //
  // Wide right margin for teacher notes. Vertical divider line via
  // borderRight on content paragraphs. Section headers + checkbox items.

  // Page width 612pt. Left margin 36pt. Content column ~248pt, teacher notes ~328pt right margin
  // Divider shifted ~40pt left from the 50-50 midpoint
  requests.push({
    updateDocumentStyle: {
      documentStyle: {
        marginTop: { magnitude: 36, unit: "PT" },
        marginBottom: { magnitude: 36, unit: "PT" },
        marginLeft: { magnitude: 36, unit: "PT" },
        marginRight: { magnitude: 328, unit: "PT" },
      },
      fields: "marginTop,marginBottom,marginLeft,marginRight",
    },
  });

  const sections = plan.sections || [];

  for (const section of sections) {
    const sectionColor = SECTION_COLORS[section.name] || DEFAULT_SECTION_COLOR;

    // Vertical divider: borderRight on every content paragraph
    const DIVIDER = {
      borderRight: {
        color: { color: { rgbColor: STYLE.lightGray } },
        width: { magnitude: 0.5, unit: "PT" },
        padding: { magnitude: 12, unit: "PT" },
        dashStyle: "SOLID",
      },
    };

    // Section header
    const label = section.name.toUpperCase() + "\n";
    const lbl = ins(label);
    lbl.advance();
    style(lbl.start, lbl.end, {
      bold: true,
      fontSize: { magnitude: STYLE.checklistSectionSize, unit: "PT" },
      foregroundColor: { color: { rgbColor: sectionColor } },
      weightedFontFamily: { fontFamily: FONT },
      smallCaps: true,
    }, "bold,fontSize,foregroundColor,weightedFontFamily,smallCaps");
    paraStyle(lbl.start, lbl.end, {
      spaceAbove: { magnitude: 12, unit: "PT" },
      spaceBelow: { magnitude: 4, unit: "PT" },
      ...DIVIDER,
    }, "spaceAbove,spaceBelow,borderRight");

    // Checkbox items
    for (const item of (section.items || [])) {
      const line = `☐  ${item.work}\n`;
      const li = ins(line);
      li.advance();
      style(li.start, li.end, {
        fontSize: { magnitude: 8, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
        weightedFontFamily: { fontFamily: FONT },
      });
      paraStyle(li.start, li.end, {
        spaceBelow: { magnitude: 2, unit: "PT" },
        ...DIVIDER,
      }, "spaceBelow,borderRight");
    }
  }

  return requests;
}

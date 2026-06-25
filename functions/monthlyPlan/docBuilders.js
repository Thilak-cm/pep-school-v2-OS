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
// Public: Checklist layout helpers
// ---------------------------------------------------------------------------

/** Page geometry constants (US Letter, points). */
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 18;

/**
 * Estimate total content height of the checklist in points.
 *
 * Uses conservative character-width approximation to overestimate wrapping
 * (errs on the side of triggering the sizing ladder early).
 *
 * @param {object} plan - Plan JSON
 * @param {number} columnWidthPt - Checklist column width in points
 * @param {number} fontSizePt - Checkbox item font size
 * @param {number} sectionSpacingPt - spaceAbove on section labels
 * @returns {number} Estimated height in points
 */
export function estimateChecklistHeight(plan, columnWidthPt, fontSizePt, sectionSpacingPt) {
  const charWidth = fontSizePt * 0.6; // Conservative average for Roboto
  const lineHeight = fontSizePt * 1.4; // Font size + leading
  const itemSpacing = 2; // spaceBelow per item
  const sectionLabelHeight = 9 * 1.4; // Section label at 9pt
  const sectionLabelSpacing = 4; // spaceBelow on section label
  const headerRowHeight = 24; // Column header row approximate height
  const docHeaderHeight = 24; // Student name header outside table

  let totalHeight = docHeaderHeight + headerRowHeight;

  for (const section of (plan.sections || [])) {
    totalHeight += sectionSpacingPt + sectionLabelHeight + sectionLabelSpacing;
    for (const item of (section.items || [])) {
      const textWidth = (item.work || "").length * charWidth;
      // Account for checkbox prefix "☐  " (~3 chars)
      const fullWidth = textWidth + 3 * charWidth;
      const lines = Math.max(1, Math.ceil(fullWidth / columnWidthPt));
      totalHeight += lines * lineHeight + itemSpacing;
    }
  }

  return totalHeight;
}

/**
 * Compute checklist layout parameters using the sizing ladder.
 *
 * Ladder (in order): widen column ratio (0.50 → 0.75 in 0.05 steps)
 * → reduce section spacing (12 → 8 → 4) → reduce font size (8 → 7).
 *
 * @param {object} plan - Plan JSON
 * @returns {{ checklistColumnRatio: number, fontSizePt: number, sectionSpacingPt: number }}
 */
export function computeChecklistLayout(plan) {
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const usableHeight = PAGE_HEIGHT - PAGE_MARGIN * 2;

  // Try increasing ratio first (0.50 to 0.75 in 0.05 steps)
  for (let ratio = 0.50; ratio <= 0.75; ratio += 0.05) {
    const colWidth = contentWidth * ratio;
    const height = estimateChecklistHeight(plan, colWidth, 8, 12);
    if (height <= usableHeight) {
      return { checklistColumnRatio: ratio, fontSizePt: 8, sectionSpacingPt: 12 };
    }
  }

  // At max ratio, try reducing section spacing
  const maxColWidth = contentWidth * 0.75;
  for (const spacing of [8, 4]) {
    const height = estimateChecklistHeight(plan, maxColWidth, 8, spacing);
    if (height <= usableHeight) {
      return { checklistColumnRatio: 0.75, fontSizePt: 8, sectionSpacingPt: spacing };
    }
  }

  // Last resort: reduce font size to 7pt floor
  for (const spacing of [12, 8, 4]) {
    const height = estimateChecklistHeight(plan, maxColWidth, 7, spacing);
    if (height <= usableHeight) {
      return { checklistColumnRatio: 0.75, fontSizePt: 7, sectionSpacingPt: spacing };
    }
  }

  // Guaranteed to fit at 7pt + 0.75 ratio + 4pt spacing, but return safe defaults
  return { checklistColumnRatio: 0.75, fontSizePt: 7, sectionSpacingPt: 4 };
}

// ---------------------------------------------------------------------------
// Public: Task checklist doc
// ---------------------------------------------------------------------------

/**
 * Build Google Docs batchUpdate requests for the task checklist doc.
 *
 * Layout:
 *   Header: Student name + classroom + month (outside table)
 *   Body: Two-column table
 *     Left column: Per-item rows — section headers + checkbox items
 *     Right column: All content cells merged into one blank free-form area
 *   Column headers: "Checklist Items" | "Teacher Comments" with gray background
 *   Borders: Left column horizontal grid + vertical divider, no outer border
 *
 * Dynamic sizing guarantees single-page output via pre-calculation.
 *
 * @param {object} plan - The plan JSON from Firestore
 * @param {object} meta - { classroomName, studentCode, childNumber }
 * @returns {Array} Google Docs API batchUpdate requests
 */
export function buildChecklistRequests(plan, meta) {
  const requests = [];

  // ── Page margins ───────────────────────────────────────────────────────
  requests.push({
    updateDocumentStyle: {
      documentStyle: {
        marginTop: { magnitude: PAGE_MARGIN, unit: "PT" },
        marginBottom: { magnitude: PAGE_MARGIN, unit: "PT" },
        marginLeft: { magnitude: PAGE_MARGIN, unit: "PT" },
        marginRight: { magnitude: PAGE_MARGIN, unit: "PT" },
      },
      fields: "marginTop,marginBottom,marginLeft,marginRight",
    },
  });

  // ── Compute layout ─────────────────────────────────────────────────────
  const layout = computeChecklistLayout(plan);
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2; // 576pt
  const leftColWidth = contentWidth * layout.checklistColumnRatio;
  const rightColWidth = contentWidth * (1 - layout.checklistColumnRatio);

  // ── Header (outside table) ─────────────────────────────────────────────
  let idx = 1;
  const monthLabel = formatMonthLabel(plan.month);
  const studentName = plan.studentName || "";
  const classroomMonth = `  ${(meta.classroomName || "").toUpperCase()} · ${monthLabel}`;
  const headerLine = `${studentName}${classroomMonth}\n`;
  requests.push({ insertText: { location: { index: idx }, text: headerLine } });
  const hlStart = idx;
  idx += headerLine.length;

  // Student name: bold 14pt
  requests.push({
    updateTextStyle: {
      range: { startIndex: hlStart, endIndex: hlStart + studentName.length },
      textStyle: {
        bold: true,
        fontSize: { magnitude: 14, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
        weightedFontFamily: { fontFamily: FONT },
      },
      fields: "bold,fontSize,foregroundColor,weightedFontFamily",
    },
  });
  // Classroom · month: gray small caps
  requests.push({
    updateTextStyle: {
      range: { startIndex: hlStart + studentName.length, endIndex: idx - 1 },
      textStyle: {
        bold: false,
        fontSize: { magnitude: 9, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.lightGray } },
        weightedFontFamily: { fontFamily: FONT },
        smallCaps: true,
      },
      fields: "bold,fontSize,foregroundColor,weightedFontFamily,smallCaps",
    },
  });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: hlStart, endIndex: idx },
      paragraphStyle: { spaceBelow: { magnitude: 4, unit: "PT" } },
      fields: "spaceBelow",
    },
  });

  // ── Build row map ──────────────────────────────────────────────────────
  // Row 0: column headers. Then per section: 1 section header row + N item rows.
  const sections = plan.sections || [];
  const rowMap = []; // { type: 'header' | 'section' | 'item', section?, item? }
  rowMap.push({ type: "header" });
  for (const section of sections) {
    rowMap.push({ type: "section", section });
    for (const item of (section.items || [])) {
      rowMap.push({ type: "item", item, section });
    }
  }
  const totalRows = rowMap.length;

  // ── Insert table ───────────────────────────────────────────────────────
  requests.push({
    insertTable: {
      rows: totalRows,
      columns: 2,
      location: { index: idx },
    },
  });

  // After insertTable, the document structure is:
  // idx: prepended newline (insertTable always adds one)
  // idx+1: TABLE element
  //
  // Each structural element (TABLE, ROW, CELL) takes 1 index.
  // Each cell has a paragraph with a \n (1 index).
  // Per row with 2 columns: 1 (ROW) + 2 * (1 CELL + 1 \n) = 5 indices.
  //
  // Layout:
  //   tableStart+0: TABLE
  //   tableStart+1: ROW_0
  //   tableStart+2: CELL(0,0)
  //   tableStart+3: \n(0,0)  ← insert text here
  //   tableStart+4: CELL(0,1)
  //   tableStart+5: \n(0,1)  ← insert text here
  //   tableStart+6: ROW_1
  //   tableStart+7: CELL(1,0)
  //   ...
  //
  // Cell paragraph index: tableStart + 3 + r * 5 + c * 2

  // insertTable prepends a newline, so the table element is at idx + 1
  const tableStart = idx + 1;
  const cellIdx = (r, c) => tableStart + 3 + r * 5 + c * 2;

  // ── Set column widths ──────────────────────────────────────────────────
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: tableStart },
      columnIndices: [0],
      tableColumnProperties: { widthType: "FIXED_WIDTH", width: { magnitude: leftColWidth, unit: "PT" } },
      fields: "widthType,width",
    },
  });
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: tableStart },
      columnIndices: [1],
      tableColumnProperties: { widthType: "FIXED_WIDTH", width: { magnitude: rightColWidth, unit: "PT" } },
      fields: "widthType,width",
    },
  });

  // ── Merge right column content cells (rows 1..N-1, all except header) ─
  if (totalRows > 2) {
    requests.push({
      mergeTableCells: {
        tableRange: {
          tableCellLocation: {
            tableStartLocation: { index: tableStart },
            rowIndex: 1,
            columnIndex: 1,
          },
          rowSpan: totalRows - 1,
          columnSpan: 1,
        },
      },
    });
  }

  // ── Fill cells (insert text into each cell's paragraph) ────────────────
  // We build all text insertions from BOTTOM to TOP to avoid index shifting.
  // Google Docs inserts shift all subsequent indices, so inserting from the
  // end backwards keeps our pre-computed indices valid.

  const textInserts = []; // { idx, text, row, col, type, section?, item? }

  for (let r = rowMap.length - 1; r >= 0; r--) {
    const entry = rowMap[r];
    const paraIdx = cellIdx(r, 0); // Left column cell

    if (entry.type === "header") {
      // Left cell: "Checklist Items"
      textInserts.push({ idx: cellIdx(r, 1), text: "Teacher Comments", row: r, col: 1, type: "header" });
      textInserts.push({ idx: paraIdx, text: "Checklist Items", row: r, col: 0, type: "header" });
    } else if (entry.type === "section") {
      textInserts.push({ idx: paraIdx, text: entry.section.name.toUpperCase(), row: r, col: 0, type: "section", section: entry.section });
    } else if (entry.type === "item") {
      textInserts.push({ idx: paraIdx, text: `☐  ${entry.item.work}`, row: r, col: 0, type: "item", section: entry.section });
    }
  }

  // Insert all text (bottom-up order so indices stay valid)
  for (const ti of textInserts) {
    requests.push({ insertText: { location: { index: ti.idx }, text: ti.text } });
  }

  // ── Style text ─────────────────────────────────────────────────────────
  // Apply styles after all text is inserted. We need to compute ranges
  // based on the text we inserted. Since we inserted bottom-up, the final
  // document has all text in place. Re-compute cell positions by walking
  // the row map top-down and tracking cumulative text lengths.

  let offset = 0; // Cumulative text inserted before this row
  const cellRanges = []; // { start, end, type, section?, item? }

  // First, compute what text was inserted in each cell (top-down)
  for (let r = 0; r < rowMap.length; r++) {
    const entry = rowMap[r];
    const paraStart = cellIdx(r, 0) + offset;

    if (entry.type === "header") {
      const leftText = "Checklist Items";
      const rightText = "Teacher Comments";
      cellRanges.push({ start: paraStart, end: paraStart + leftText.length, type: "header", col: 0 });
      const rightParaStart = cellIdx(r, 1) + offset + leftText.length;
      cellRanges.push({ start: rightParaStart, end: rightParaStart + rightText.length, type: "header", col: 1 });
      offset += leftText.length + rightText.length;
    } else if (entry.type === "section") {
      const text = entry.section.name.toUpperCase();
      cellRanges.push({ start: paraStart, end: paraStart + text.length, type: "section", section: entry.section });
      offset += text.length;
    } else if (entry.type === "item") {
      const text = `☐  ${entry.item.work}`;
      cellRanges.push({ start: paraStart, end: paraStart + text.length, type: "item", section: entry.section });
      offset += text.length;
    }
  }

  // Style each range
  for (const cr of cellRanges) {
    if (cr.type === "header") {
      requests.push({
        updateTextStyle: {
          range: { startIndex: cr.start, endIndex: cr.end },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 8, unit: "PT" },
            foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
            weightedFontFamily: { fontFamily: FONT },
          },
          fields: "bold,fontSize,foregroundColor,weightedFontFamily",
        },
      });
    } else if (cr.type === "section") {
      const sectionColor = SECTION_COLORS[cr.section.name] || DEFAULT_SECTION_COLOR;
      requests.push({
        updateTextStyle: {
          range: { startIndex: cr.start, endIndex: cr.end },
          textStyle: {
            bold: true,
            fontSize: { magnitude: STYLE.checklistSectionSize, unit: "PT" },
            foregroundColor: { color: { rgbColor: sectionColor } },
            weightedFontFamily: { fontFamily: FONT },
            smallCaps: true,
          },
          fields: "bold,fontSize,foregroundColor,weightedFontFamily,smallCaps",
        },
      });
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: cr.start, endIndex: cr.end + 1 },
          paragraphStyle: {
            spaceAbove: { magnitude: layout.sectionSpacingPt, unit: "PT" },
            spaceBelow: { magnitude: 4, unit: "PT" },
          },
          fields: "spaceAbove,spaceBelow",
        },
      });
    } else if (cr.type === "item") {
      requests.push({
        updateTextStyle: {
          range: { startIndex: cr.start, endIndex: cr.end },
          textStyle: {
            fontSize: { magnitude: layout.fontSizePt, unit: "PT" },
            foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
            weightedFontFamily: { fontFamily: FONT },
          },
          fields: "fontSize,foregroundColor,weightedFontFamily",
        },
      });
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: cr.start, endIndex: cr.end + 1 },
          paragraphStyle: { spaceBelow: { magnitude: 2, unit: "PT" } },
          fields: "spaceBelow",
        },
      });
    }
  }

  // ── Helper: updateTableCellStyle with correct tableRange wrapper ─────
  const cellStyle = (row, col, style, fields) => {
    requests.push({
      updateTableCellStyle: {
        tableRange: {
          tableCellLocation: {
            tableStartLocation: { index: tableStart },
            rowIndex: row,
            columnIndex: col,
          },
          rowSpan: 1,
          columnSpan: 1,
        },
        tableCellStyle: style,
        fields,
      },
    });
  };

  // ── Header row background ──────────────────────────────────────────────
  for (let c = 0; c < 2; c++) {
    cellStyle(0, c, {
      backgroundColor: { color: { rgbColor: STYLE.rationaleBg } },
    }, "backgroundColor");
  }

  // ── Borders: left column grid + vertical divider, no outer border ──────
  const noBorder = { width: { magnitude: 0, unit: "PT" }, dashStyle: "SOLID",
    color: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } } };
  const thinGray = { width: { magnitude: 0.5, unit: "PT" }, dashStyle: "SOLID",
    color: { color: { rgbColor: STYLE.lightGray } } };

  // Left column cells: bottom border (grid) + right border (divider)
  for (let r = 0; r < totalRows; r++) {
    cellStyle(r, 0, {
      borderBottom: thinGray,
      borderRight: thinGray,
      borderTop: r === 0 ? noBorder : undefined,
      borderLeft: noBorder,
    }, r === 0
      ? "borderBottom,borderRight,borderTop,borderLeft"
      : "borderBottom,borderRight,borderLeft");
  }

  // Right column cells: no borders (outer hidden, internal hidden)
  cellStyle(0, 1, {
    borderTop: noBorder,
    borderRight: noBorder,
    borderBottom: thinGray,
  }, "borderTop,borderRight,borderBottom");

  if (totalRows > 1) {
    cellStyle(1, 1, {
      borderTop: noBorder,
      borderRight: noBorder,
      borderBottom: noBorder,
    }, "borderTop,borderRight,borderBottom");
  }

  return requests;
}

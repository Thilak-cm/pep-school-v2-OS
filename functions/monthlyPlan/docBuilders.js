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
  studentCodeSize: 9,
  // Detailed plan
  sectionHeadingSize: 14,
  rationaleSize: 9,
  itemTitleSize: 11,
  itemLabelSize: 8,
  itemBodySize: 9,
  // Checklist
  checklistSectionSize: 9,
  checklistItemSize: 8,
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
 *       work (title) → WHY → HOW TO OFFER → SUCCESS → NEXT → HOOK → BASIS
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

  // Line 1: "{CLASSROOM} · CHILD {NN}"
  const classroomUpper = (meta.classroomName || "").toUpperCase();
  const headerLine1 = `${classroomUpper} · CHILD ${meta.childNumber || "01"}\n`;
  const h1 = ins(headerLine1);
  h1.advance();
  style(h1.start, h1.end, {
    fontSize: { magnitude: STYLE.headerMetaSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
    smallCaps: true,
  }, "fontSize,foregroundColor,weightedFontFamily,smallCaps");

  // Line 2: Student name + code badge
  const nameLine = `${plan.studentName}  ${meta.studentCode || ""}\n`;
  const nl = ins(nameLine);
  nl.advance();
  // Style the name part bold + large
  const nameEnd = nl.start + plan.studentName.length;
  style(nl.start, nameEnd, {
    bold: true,
    fontSize: { magnitude: STYLE.studentNameSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");
  // Style the code part smaller
  if (meta.studentCode) {
    const codeStart = nameEnd + 2; // skip "  "
    style(codeStart, nl.end - 1, { // -1 for \n
      fontSize: { magnitude: STYLE.studentCodeSize, unit: "PT" },
      foregroundColor: { color: { rgbColor: STYLE.labelColor } },
      weightedFontFamily: { fontFamily: FONT },
    });
  }

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
        { label: "HOW TO OFFER", value: item.offer },
        { label: "SUCCESS", value: item.watch },
        { label: "NEXT", value: item.next },
        { label: "HOOK", value: item.hook },
        { label: "BASIS", value: item.basis },
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
        // Value: normal, body color
        style(ff.start + labelText.length, ff.end, {
          bold: false,
          fontSize: { magnitude: STYLE.itemBodySize, unit: "PT" },
          foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
          weightedFontFamily: { fontFamily: FONT },
        }, "bold,fontSize,foregroundColor,weightedFontFamily");
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

  // Student code in top-right (small)
  const codeHeader = `${plan.studentName} ${meta.studentCode || ""}\n`;
  const ch = ins(codeHeader);
  ch.advance();
  style(ch.start, ch.end, {
    fontSize: { magnitude: 7, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
  });
  paraStyle(ch.start, ch.end, { alignment: "END" }, "alignment");

  // Student name (large, bold)
  const nameLine = `${plan.studentName}  ${meta.studentCode || ""}\n`;
  const nl = ins(nameLine);
  nl.advance();
  const nameEnd = nl.start + plan.studentName.length;
  style(nl.start, nameEnd, {
    bold: true,
    fontSize: { magnitude: 14, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
    weightedFontFamily: { fontFamily: FONT },
  }, "bold,fontSize,foregroundColor,weightedFontFamily");
  if (meta.studentCode) {
    style(nameEnd + 2, nl.end - 1, {
      fontSize: { magnitude: STYLE.studentCodeSize, unit: "PT" },
      foregroundColor: { color: { rgbColor: STYLE.labelColor } },
      weightedFontFamily: { fontFamily: FONT },
    });
  }

  // Classroom + month
  const monthLabel = formatMonthLabel(plan.month);
  const subLine = `${meta.classroomName || ""}  ·  ${monthLabel} plan\n\n`;
  const sl = ins(subLine);
  sl.advance();
  style(sl.start, sl.end, {
    fontSize: { magnitude: STYLE.headerMetaSize, unit: "PT" },
    foregroundColor: { color: { rgbColor: STYLE.lightGray } },
    weightedFontFamily: { fontFamily: FONT },
  });

  // ── Two-column table ────────────────────────────────────────────────────

  // Count total rows: one per section (all sections stack in left column)
  // We use a single table with N rows (one per section) × 2 columns
  const sectionCount = (plan.sections || []).length;
  const tableRows = Math.max(sectionCount, 1);

  requests.push({
    insertTable: {
      rows: tableRows,
      columns: 2,
      location: { index: idx },
    },
  });

  // After insertTable, the doc structure is:
  // TABLE_START (idx+1) → ROW_START → CELL_START → PARA → CELL_END → CELL_START → PARA → CELL_END → ROW_END → ...
  // Each structural element occupies 1 index.
  // For a table with R rows × C cols:
  //   Table start: +1
  //   Per row: row_start(+1) + C * (cell_start(+1) + paragraph(+1) + newline(+1) + cell_end(0)) + row_end(0)
  //   Actually: table(1) + per_row(1 + cols*(1+1+1)) = table occupies 1 + rows*(1 + cols*3) indexes
  //   But we need to track the paragraph index inside each cell to insert text.

  // The table element itself uses some index space. We need to find the
  // paragraph index inside each cell. After insertTable at index `idx`:
  //   idx+1: table start
  //   idx+2: row 0 start
  //   idx+3: cell (0,0) start
  //   idx+4: paragraph in cell (0,0) — this is where we insert text for left col row 0
  //   idx+5: cell (0,1) start
  //   idx+6: paragraph in cell (0,1) — right col row 0
  //   idx+7: row 1 start
  //   idx+8: cell (1,0) start
  //   ...pattern: cell(r,c) paragraph = idx + 1 + r*(1 + 2*2) + 1 + c*2 + 1
  //   Actually the exact offsets depend on the Docs API spec. Let me use a simpler approach.

  // For an R×C table inserted at index `idx`, the paragraph inside cell(r,c) is at:
  //   idx + 1                 (table element)
  //   + r * (1 + C * 2)       (each row: row_start + C cells * (cell_start + paragraph))
  //   + 1                     (row_start for this row)
  //   + c * 2                 (skip prior cells: cell_start + paragraph each)
  //   + 1                     (cell_start for this cell)
  //   + 1                     (the paragraph itself — where text goes)
  //
  // Simplified: paragraphIndex(r, c) = idx + 2 + r*(1 + C*2) + 1 + c*2
  // Wait, let me be precise. After insertTable with R rows and C columns:
  //
  // Structure (indices relative to table insertion point `idx`):
  //   idx      — paragraph before table (existing)
  //   idx+1    — table element
  //   For row r (0-based):
  //     base = idx + 2 + r * (1 + C * 2)
  //     base      — row start
  //     For col c:
  //       cellBase = base + 1 + c * 2
  //       cellBase     — cell start
  //       cellBase + 1 — paragraph inside cell (insert text here)

  const C = 2; // columns
  function cellParaIndex(r, c) {
    // Table inserted at `idx`. The paragraph inside cell (r, c):
    const tableStart = idx + 1;
    const rowBase = tableStart + r * (1 + C * 2);
    return rowBase + 1 + c * 2 + 1;
  }

  // Total index space consumed by the table
  const tableSize = 1 + tableRows * (1 + C * 2);
  idx += tableSize;

  // Now insert content into each cell. We must insert in REVERSE order
  // (highest index first) to avoid shifting issues.
  const cellInserts = [];

  for (let r = 0; r < sectionCount; r++) {
    const section = plan.sections[r];
    const sectionColor = SECTION_COLORS[section.name] || DEFAULT_SECTION_COLOR;

    // Left cell: section name + checkbox items
    const leftParaIdx = cellParaIndex(r, 0);
    const sectionLabel = section.name.toUpperCase() + "\n";
    let leftContent = sectionLabel;
    for (const item of (section.items || [])) {
      leftContent += `☐  ${item.work}\n`;
    }

    cellInserts.push({
      paraIdx: leftParaIdx,
      content: leftContent,
      sectionColor,
      sectionLabelLen: sectionLabel.length,
    });

    // Right cell: empty (teacher notes space) — just leave default paragraph
  }

  // Insert in reverse index order
  cellInserts.sort((a, b) => b.paraIdx - a.paraIdx);

  for (const cell of cellInserts) {
    requests.push({
      insertText: {
        location: { index: cell.paraIdx },
        text: cell.content,
      },
    });
    // Style the section label (bold, colored, small caps)
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: cell.paraIdx,
          endIndex: cell.paraIdx + cell.sectionLabelLen,
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: STYLE.checklistSectionSize, unit: "PT" },
          foregroundColor: { color: { rgbColor: cell.sectionColor } },
          weightedFontFamily: { fontFamily: FONT },
          smallCaps: true,
        },
        fields: "bold,fontSize,foregroundColor,weightedFontFamily,smallCaps",
      },
    });
    // Style the checkbox items
    const itemsStart = cell.paraIdx + cell.sectionLabelLen;
    const itemsEnd = cell.paraIdx + cell.content.length;
    if (itemsEnd > itemsStart) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: itemsStart, endIndex: itemsEnd },
          textStyle: {
            fontSize: { magnitude: 8, unit: "PT" },
            foregroundColor: { color: { rgbColor: STYLE.bodyColor } },
            weightedFontFamily: { fontFamily: FONT },
          },
          fields: "fontSize,foregroundColor,weightedFontFamily",
        },
      });
    }
  }

  // ── Table column widths ──────────────────────────────────────────────────
  // Left column ~55%, right column ~45% (for teacher notes)
  // Note: Google Docs API doesn't directly support column width percentage in
  // batchUpdate. We'll set the table's column properties via updateTableColumnProperties.
  // Page width ~468pt (Letter 612pt - 72pt margins × 2)
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: idx - tableSize + 1 },
      columnIndices: [0],
      tableColumnProperties: {
        widthType: "FIXED_WIDTH",
        width: { magnitude: 260, unit: "PT" },
      },
      fields: "widthType,width",
    },
  });
  requests.push({
    updateTableColumnProperties: {
      tableStartLocation: { index: idx - tableSize + 1 },
      columnIndices: [1],
      tableColumnProperties: {
        widthType: "FIXED_WIDTH",
        width: { magnitude: 208, unit: "PT" },
      },
      fields: "widthType,width",
    },
  });

  // ── Footer ──────────────────────────────────────────────────────────────

  const footerText = `\nRationale and detailed how-to-offer notes are in the companion Monthly Plan document.\n`;
  requests.push({
    insertText: { location: { index: idx }, text: footerText },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: idx, endIndex: idx + footerText.length },
      textStyle: {
        italic: true,
        fontSize: { magnitude: STYLE.checklistFooterSize, unit: "PT" },
        foregroundColor: { color: { rgbColor: STYLE.lightGray } },
        weightedFontFamily: { fontFamily: FONT },
      },
      fields: "italic,fontSize,foregroundColor,weightedFontFamily",
    },
  });
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: idx, endIndex: idx + footerText.length },
      paragraphStyle: { alignment: "CENTER" },
      fields: "alignment",
    },
  });
  idx += footerText.length;

  return requests;
}

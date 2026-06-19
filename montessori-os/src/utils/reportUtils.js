/**
 * Returns the default date range for report generation.
 * Term 2 starts Oct 15, so:
 * - If current date is Oct 15 or later → start = Oct 15 of current year
 * - If current date is before Oct 15   → start = Oct 15 of previous year
 * End is always "now".
 */
export function getDefaultReportDateRange(now = new Date()) {
  const pastOct15 = now.getMonth() > 9 || (now.getMonth() === 9 && now.getDate() >= 15);
  const year = pastOct15 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 9, 15); // Oct 15
  return { start, end: now };
}

/**
 * Format a Date as yyyy-mm-dd (native input[type=date] format).
 */
export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalise a Firestore Timestamp-like value to a JS Date.
 * Accepts: Date, {toDate()}, {seconds}, ISO string, or null.
 */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Build a sorted list of report summaries from raw Firestore ai_summaries docs.
 * Filters to docs with id starting with 'report_', sorts newest first.
 */
export function buildReportList(docs) {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((d) => d.id && d.id.startsWith('report_'))
    .map((d) => ({
      id: d.id,
      generatedAt: toDate(d.generatedAt),
      dateRangeStart: toDate(d.dateRangeStart),
      dateRangeEnd: toDate(d.dateRangeEnd),
      noteCount: d.noteCount ?? null,
      reportText: d.reportText || '',
      status: d.status || null,
      reportType: d.reportType || 'term',
      missingInputFlags: d.missingInputFlags || [],
      sentimentScore: d.sentimentScore ?? null,
      areaBalanceScore: d.areaBalanceScore ?? null,
      generatedBy: d.generatedBy || '',
      generatedByName: d.generatedByName || null,
      driveDocLink: d.driveDocLink || null,
    }))
    .sort((a, b) => {
      const ta = a.generatedAt ? a.generatedAt.getTime() : 0;
      const tb = b.generatedAt ? b.generatedAt.getTime() : 0;
      return tb - ta;
    });
}

/**
 * Parse markdown report text into sections split on ## headings.
 * Returns array of { heading: string|null, content: string }.
 * Content before the first heading gets heading=null.
 * Only splits on ## (h2), deeper headings (###, ####) stay as content.
 */
export function parseReportSections(markdown) {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const sections = [];
  let currentHeading = null;
  let currentContent = [];
  let hasAny = false;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      // Save previous section
      if (hasAny) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n') });
      }
      currentHeading = headingMatch[1].trim();
      currentContent = [];
      hasAny = true;
    } else {
      currentContent.push(line);
      if (!hasAny) hasAny = true;
    }
  }

  // Save last section
  if (hasAny) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n') });
  }

  return sections;
}

/**
 * Parse section content into blocks, splitting on ### sub-headings.
 * Returns array of { subheading: string|null, text: string }.
 */
export function renderSectionContent(content) {
  if (!content || !content.trim()) return [];

  const lines = content.split('\n');
  const blocks = [];
  let currentSubheading = null;
  let currentText = [];
  let hasAny = false;

  for (const line of lines) {
    const subMatch = line.match(/^###+ (.+)$/);
    if (subMatch) {
      if (hasAny) {
        blocks.push({ subheading: currentSubheading, text: currentText.join('\n') });
      }
      currentSubheading = subMatch[1].trim();
      currentText = [];
      hasAny = true;
    } else {
      currentText.push(line);
      if (!hasAny) hasAny = true;
    }
  }

  if (hasAny) {
    blocks.push({ subheading: currentSubheading, text: currentText.join('\n') });
  }

  return blocks;
}

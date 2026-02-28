/**
 * Returns the default date range for report generation.
 * Academic year starts Nov 1, so:
 * - If current month is Nov or later → start = Nov 1 of current year
 * - If current month is before Nov  → start = Nov 1 of previous year
 * End is always "now".
 */
export function getDefaultReportDateRange(now = new Date()) {
  const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 10, 1); // Nov 1
  return { start, end: now };
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

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultReportDateRange, parseReportSections, renderSectionContent } from './reportUtils.js';

describe('getDefaultReportDateRange', () => {
  it('returns Oct 15 of previous year when current month is before October', () => {
    // January 15, 2026
    const now = new Date(2026, 0, 15);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 9); // October (0-indexed)
    assert.equal(start.getDate(), 15);
    assert.equal(end, now);
  });

  it('returns Oct 15 of current year when current month is November', () => {
    // November 20, 2025
    const now = new Date(2025, 10, 20);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(end, now);
  });

  it('returns Oct 15 of current year when current month is December', () => {
    // December 5, 2025
    const now = new Date(2025, 11, 5);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(end, now);
  });

  it('returns Oct 15 of previous year on October 14 (boundary)', () => {
    // October 14, 2026 — just before the term starts
    const now = new Date(2026, 9, 14);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(end, now);
  });

  it('returns Oct 15 of current year on exactly October 15 (boundary)', () => {
    // October 15, 2026 — term start day
    const now = new Date(2026, 9, 15);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2026);
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.equal(end, now);
  });

  it('uses current time as default when no argument passed', () => {
    const before = new Date();
    const { start, end } = getDefaultReportDateRange();
    const after = new Date();
    assert.equal(start.getMonth(), 9);
    assert.equal(start.getDate(), 15);
    assert.ok(end >= before && end <= after);
  });
});

describe('parseReportSections', () => {
  it('parses markdown with ## headings into sections', () => {
    const md = `## PSED\nSome content about PSED.\n\n## Language & Literacy\nReading and writing progress.`;
    const sections = parseReportSections(md);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, 'PSED');
    assert.ok(sections[0].content.includes('Some content about PSED.'));
    assert.equal(sections[1].heading, 'Language & Literacy');
    assert.ok(sections[1].content.includes('Reading and writing progress.'));
  });

  it('handles content before the first heading as intro', () => {
    const md = `Introduction paragraph.\n\n## Section One\nContent here.`;
    const sections = parseReportSections(md);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, null);
    assert.ok(sections[0].content.includes('Introduction paragraph.'));
    assert.equal(sections[1].heading, 'Section One');
  });

  it('returns single section with null heading for plain text', () => {
    const md = 'Just a paragraph with no headings.';
    const sections = parseReportSections(md);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, null);
    assert.ok(sections[0].content.includes('Just a paragraph'));
  });

  it('returns empty array for empty string', () => {
    const sections = parseReportSections('');
    assert.deepEqual(sections, []);
  });

  it('returns empty array for null/undefined', () => {
    assert.deepEqual(parseReportSections(null), []);
    assert.deepEqual(parseReportSections(undefined), []);
  });

  it('handles consecutive headings with no content between them', () => {
    const md = `## Heading One\n## Heading Two\nSome content.`;
    const sections = parseReportSections(md);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, 'Heading One');
    assert.equal(sections[0].content.trim(), '');
    assert.equal(sections[1].heading, 'Heading Two');
    assert.ok(sections[1].content.includes('Some content.'));
  });

  it('handles ### and deeper headings as content (only splits on ##)', () => {
    const md = `## Main Section\nContent\n### Subsection\nMore content.`;
    const sections = parseReportSections(md);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, 'Main Section');
    assert.ok(sections[0].content.includes('### Subsection'));
    assert.ok(sections[0].content.includes('More content.'));
  });
});

describe('renderSectionContent', () => {
  it('splits content on ### sub-headings', () => {
    const content = `### Science\nGood progress.\n### Math\nNeeds work.`;
    const blocks = renderSectionContent(content);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].subheading, 'Science');
    assert.ok(blocks[0].text.includes('Good progress.'));
    assert.equal(blocks[1].subheading, 'Math');
    assert.ok(blocks[1].text.includes('Needs work.'));
  });

  it('handles content before first sub-heading', () => {
    const content = `Intro text.\n### Section\nBody.`;
    const blocks = renderSectionContent(content);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].subheading, null);
    assert.ok(blocks[0].text.includes('Intro text.'));
    assert.equal(blocks[1].subheading, 'Section');
  });

  it('handles #### headings too', () => {
    const content = `#### Deep Heading\nSome text.`;
    const blocks = renderSectionContent(content);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].subheading, 'Deep Heading');
    assert.ok(blocks[0].text.includes('Some text.'));
  });

  it('returns empty array for empty/null content', () => {
    assert.deepEqual(renderSectionContent(''), []);
    assert.deepEqual(renderSectionContent(null), []);
    assert.deepEqual(renderSectionContent(undefined), []);
  });

  it('returns single block with null subheading for plain text', () => {
    const blocks = renderSectionContent('Just a paragraph.');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].subheading, null);
    assert.ok(blocks[0].text.includes('Just a paragraph.'));
  });
});

describe('buildReportList', () => {
  // Lazy import so test file loads even before the function exists
  let buildReportList;
  before(async () => {
    ({ buildReportList } = await import('./reportUtils.js'));
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(buildReportList([]), []);
  });

  it('returns empty array for null/undefined', () => {
    assert.deepEqual(buildReportList(null), []);
    assert.deepEqual(buildReportList(undefined), []);
  });

  it('filters out non-report docs (baseball_card, signals)', () => {
    const docs = [
      { id: 'baseball_card', generatedAt: new Date('2026-01-15') },
      { id: 'signals', status: 'ok' },
      { id: 'report_1700000000000', generatedAt: new Date('2026-01-20'), reportText: 'Report content' },
    ];
    const result = buildReportList(docs);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'report_1700000000000');
  });

  it('sorts reports by generatedAt descending (newest first)', () => {
    const docs = [
      { id: 'report_1000', generatedAt: new Date('2026-01-10'), reportText: 'Old' },
      { id: 'report_3000', generatedAt: new Date('2026-03-01'), reportText: 'Newest' },
      { id: 'report_2000', generatedAt: new Date('2026-02-15'), reportText: 'Middle' },
    ];
    const result = buildReportList(docs);
    assert.equal(result.length, 3);
    assert.equal(result[0].id, 'report_3000');
    assert.equal(result[1].id, 'report_2000');
    assert.equal(result[2].id, 'report_1000');
  });

  it('extracts key fields from each report doc', () => {
    const docs = [
      {
        id: 'report_123',
        generatedAt: new Date('2026-02-20T10:00:00Z'),
        dateRangeStart: new Date('2025-11-01'),
        dateRangeEnd: new Date('2026-02-20'),
        noteCount: 42,
        reportText: 'Report body here',
        status: 'ok',
        docId: 'report_123',
      },
    ];
    const result = buildReportList(docs);
    assert.equal(result.length, 1);
    const r = result[0];
    assert.equal(r.id, 'report_123');
    assert.equal(r.noteCount, 42);
    assert.equal(r.reportText, 'Report body here');
    assert.equal(r.status, 'ok');
    assert.ok(r.generatedAt instanceof Date);
  });

  it('handles missing generatedAt gracefully (sorts to end)', () => {
    const docs = [
      { id: 'report_a', generatedAt: null, reportText: 'No date' },
      { id: 'report_b', generatedAt: new Date('2026-02-01'), reportText: 'Has date' },
    ];
    const result = buildReportList(docs);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'report_b');
    assert.equal(result[1].id, 'report_a');
  });

  it('handles Firestore Timestamp-like objects with toDate()', () => {
    const fakeTimestamp = { toDate: () => new Date('2026-01-15T08:00:00Z') };
    const docs = [
      { id: 'report_ts', generatedAt: fakeTimestamp, reportText: 'Timestamp test' },
    ];
    const result = buildReportList(docs);
    assert.equal(result.length, 1);
    assert.ok(result[0].generatedAt instanceof Date);
    assert.equal(result[0].generatedAt.toISOString(), '2026-01-15T08:00:00.000Z');
  });

  it('extracts generatedBy and generatedByName from report docs', () => {
    const docs = [
      {
        id: 'report_author',
        generatedAt: new Date('2026-03-01'),
        reportText: 'Content',
        generatedBy: 'uid_123',
        generatedByName: 'Priya Sharma',
      },
    ];
    const result = buildReportList(docs);
    assert.equal(result[0].generatedBy, 'uid_123');
    assert.equal(result[0].generatedByName, 'Priya Sharma');
  });

  it('defaults generatedBy to empty string and generatedByName to null when missing', () => {
    const docs = [
      { id: 'report_no_author', generatedAt: new Date('2026-03-01'), reportText: 'Content' },
    ];
    const result = buildReportList(docs);
    assert.equal(result[0].generatedBy, '');
    assert.equal(result[0].generatedByName, null);
  });
});

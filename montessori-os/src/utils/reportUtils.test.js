import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultReportDateRange, parseReportSections, renderSectionContent } from './reportUtils.js';

describe('getDefaultReportDateRange', () => {
  it('returns Nov 1 of previous year when current month is before November', () => {
    // January 15, 2026
    const now = new Date(2026, 0, 15);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 10); // November (0-indexed)
    assert.equal(start.getDate(), 1);
    assert.equal(end, now);
  });

  it('returns Nov 1 of current year when current month is November', () => {
    // November 20, 2025
    const now = new Date(2025, 10, 20);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 10);
    assert.equal(start.getDate(), 1);
    assert.equal(end, now);
  });

  it('returns Nov 1 of current year when current month is December', () => {
    // December 5, 2025
    const now = new Date(2025, 11, 5);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 10);
    assert.equal(start.getDate(), 1);
    assert.equal(end, now);
  });

  it('returns Nov 1 of previous year in October', () => {
    // October 31, 2026
    const now = new Date(2026, 9, 31);
    const { start, end } = getDefaultReportDateRange(now);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 10);
    assert.equal(start.getDate(), 1);
    assert.equal(end, now);
  });

  it('uses current time as default when no argument passed', () => {
    const before = new Date();
    const { start, end } = getDefaultReportDateRange();
    const after = new Date();
    assert.equal(start.getMonth(), 10);
    assert.equal(start.getDate(), 1);
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

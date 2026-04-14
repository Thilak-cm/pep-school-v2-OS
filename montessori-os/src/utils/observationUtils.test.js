import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('./observationUtils.jsx', import.meta.url);

describe('getObservationTypeIcon - report type', () => {
  it('has a branch for report type that returns Description icon', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.ok(
      /type\s*===\s*['"]report['"]/.test(source),
      'Expected getObservationTypeIcon to handle report type',
    );
    assert.ok(
      source.includes('Description'),
      'Expected Description icon import for report type',
    );
  });

  it('imports Description from @mui/icons-material', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    assert.ok(
      /import\s*\{[^}]*Description[^}]*\}\s*from\s*['"]@mui\/icons-material['"]/.test(source),
      'Expected Description to be imported from @mui/icons-material',
    );
  });
});

describe('getObservationTypeText - report type', () => {
  it('returns "Report" for report type', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    // Find the getObservationTypeText function and verify it handles 'report'
    const fnMatch = source.match(/getObservationTypeText\s*=\s*\(type\)\s*=>\s*\{([\s\S]*?\n\};)/);
    assert.ok(fnMatch, 'Expected to find getObservationTypeText function');
    assert.ok(
      fnMatch[1].includes("'report'") && fnMatch[1].includes("'Report'"),
      "Expected getObservationTypeText to return 'Report' for report type",
    );
  });

  it('still handles existing types (lesson, media, default)', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    const fnMatch = source.match(/getObservationTypeText\s*=\s*\(type\)\s*=>\s*\{([\s\S]*?\n\};)/);
    assert.ok(fnMatch, 'Expected to find getObservationTypeText function');
    assert.ok(fnMatch[1].includes("'Lesson Note'"), 'Expected Lesson Note text');
    assert.ok(fnMatch[1].includes("'Media Note'"), 'Expected Media Note text');
    assert.ok(fnMatch[1].includes("'Observation'"), 'Expected Observation default text');
  });
});

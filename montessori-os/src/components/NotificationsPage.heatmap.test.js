import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPastWeekKeys } from '../utils/weekKey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'NotificationsPage.jsx'), 'utf-8');

// --- getPastWeekKeys ---

describe('getPastWeekKeys', () => {
  it('returns exactly count keys in oldest→newest order', () => {
    const ref = new Date('2026-06-15T12:00:00Z'); // W25
    const keys = getPastWeekKeys(5, ref);
    assert.equal(keys.length, 5);
    // W20, W21, W22, W23, W24 (oldest→newest, excludes current W25)
    assert.equal(keys[0], '2026-W20');
    assert.equal(keys[4], '2026-W24');
  });

  it('each key is a valid ISO week format', () => {
    const keys = getPastWeekKeys(5, new Date('2026-06-15T12:00:00Z'));
    for (const key of keys) {
      assert.match(key, /^\d{4}-W\d{2}$/);
    }
  });

  it('keys are in ascending chronological order', () => {
    const keys = getPastWeekKeys(5, new Date('2026-06-15T12:00:00Z'));
    for (let i = 1; i < keys.length; i++) {
      assert.ok(keys[i] > keys[i - 1], `${keys[i]} should be after ${keys[i - 1]}`);
    }
  });

  it('handles year boundary (early January)', () => {
    // Jan 12 2026 is W03; past 5 should span into 2025
    const keys = getPastWeekKeys(5, new Date('2026-01-12T12:00:00Z'));
    assert.equal(keys.length, 5);
    // Some keys should reference 2025 or 2026-W01
    assert.ok(keys[0] < '2026-W03', 'First key should be before W03');
  });
});

// --- Severity-to-color mapping ---

describe('Heatmap flag palette', () => {
  it('maps clear severity to green (--color-secondary-light)', () => {
    assert.ok(source.includes('--color-secondary-light'), 'Missing green (Thriving) color token');
  });

  it('maps low severity to blue (--color-info)', () => {
    assert.ok(source.includes('--color-info'), 'Missing blue (Steady) color token');
  });

  it('maps medium severity to yellow (--color-warning)', () => {
    assert.ok(source.includes('--color-warning'), 'Missing yellow (Watch) color token');
  });

  it('maps high severity to red (--color-error)', () => {
    assert.ok(source.includes('--color-error'), 'Missing red (Flag) color token');
  });

  it('defines all four flag keys (g, b, y, r)', () => {
    const hasMapping = source.includes("'g'") && source.includes("'b'")
      && source.includes("'y'") && source.includes("'r'");
    assert.ok(hasMapping, 'Missing flag palette keys g/b/y/r');
  });
});

// --- Heatmap card structure ---

describe('Heatmap card UI structure', () => {
  it('renders "Flag pattern" header', () => {
    assert.ok(source.includes('Flag pattern'), 'Missing "Flag pattern" header');
  });

  it('renders "LAST 6 WEEKS" label', () => {
    assert.ok(source.includes('LAST 6 WEEKS'), 'Missing "LAST 6 WEEKS" label');
  });

  it('renders dynamic week column headers with NOW as last label', () => {
    assert.ok(source.includes("'NOW'"), 'Missing NOW column header');
    assert.ok(source.includes('weekKeyToLabel'), 'Should use weekKeyToLabel for past week labels');
  });

  it('renders legend with four labels', () => {
    assert.ok(source.includes('Thriving'), 'Missing Thriving legend');
    assert.ok(source.includes('Steady'), 'Missing Steady legend');
    assert.ok(source.includes('Watch'), 'Missing Watch legend');
    // "Flag" appears in many contexts, check for legend context
    const legendPattern = /Thriving[\s\S]*Steady[\s\S]*Watch[\s\S]*Flag/;
    assert.ok(legendPattern.test(source), 'Legend should have all four labels in order');
  });

  it('renders tap affordance hint', () => {
    assert.ok(
      source.includes('Tap a student for their weekly snapshot'),
      'Missing tap affordance hint'
    );
  });

  it('renders search input for student lookup', () => {
    assert.ok(
      source.includes('Look up a student') || source.includes('look up a student'),
      'Missing search placeholder text'
    );
  });

  it('renders "Others" placeholder section', () => {
    assert.ok(
      source.includes('More coming soon') || source.includes('more coming soon'),
      'Missing Others placeholder'
    );
  });
});

// --- Missing week cells ---

describe('Missing week cell styling', () => {
  it('uses dashed border for empty/missing week cells', () => {
    assert.ok(
      source.includes('dashed') || source.includes('dotted'),
      'Missing dashed/dotted border for empty week cells'
    );
  });
});

// --- Navigation ---

describe('Navigation', () => {
  it('dispatches navigateToStudentNotes for View Dashboard', () => {
    assert.ok(
      source.includes('navigateToStudentNotes'),
      'Should dispatch navigateToStudentNotes event for dashboard navigation'
    );
  });

  it('includes View Dashboard button', () => {
    assert.ok(
      source.includes('View Dashboard'),
      'Missing View Dashboard button'
    );
  });
});

// --- Bottom-sheet modal ---

describe('Bottom-sheet modal', () => {
  it('reuses SnapshotCard component', () => {
    assert.ok(
      source.includes('SnapshotCard'),
      'Should reuse SnapshotCard component in modal'
    );
  });

  it('includes Close button', () => {
    assert.ok(
      source.includes('Close'),
      'Missing Close button in modal'
    );
  });
});

// --- Trend summary ---

describe('Trend summary', () => {
  it('shows escalated count', () => {
    assert.ok(
      source.includes('escalated') || source.includes('Escalated'),
      'Missing escalated trend label'
    );
  });

  it('shows steady count', () => {
    assert.ok(
      source.includes('steady') || source.includes('Steady'),
      'Missing steady trend label'
    );
  });

  it('shows improved count', () => {
    assert.ok(
      source.includes('improved') || source.includes('Improved'),
      'Missing improved trend label'
    );
  });

  it('includes SVG trend glyphs', () => {
    // Check for the SVG path data from the spec
    assert.ok(source.includes('viewBox'), 'Missing SVG trend glyph viewBox');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPastWeekKeys } from '../utils/weekKey.js';
import { severityToFlag, flagSortValue, FLAG_SORT_ORDER } from '../utils/heatmapUtils.js';

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

// --- severityToFlag behavioral tests ---

describe('severityToFlag', () => {
  it('maps "high" to "r"', () => {
    assert.equal(severityToFlag('high'), 'r');
  });

  it('maps "medium" to "y"', () => {
    assert.equal(severityToFlag('medium'), 'y');
  });

  it('maps "med" to "y"', () => {
    assert.equal(severityToFlag('med'), 'y');
  });

  it('maps "low" to "b"', () => {
    assert.equal(severityToFlag('low'), 'b');
  });

  it('maps "clear" to "g"', () => {
    assert.equal(severityToFlag('clear'), 'g');
  });

  it('maps null/undefined to "g"', () => {
    assert.equal(severityToFlag(null), 'g');
    assert.equal(severityToFlag(undefined), 'g');
  });

  it('maps unknown string to "g"', () => {
    assert.equal(severityToFlag('banana'), 'g');
  });
});

// --- flagSortValue behavioral tests ---

describe('flagSortValue', () => {
  it('returns 0 for "r" (highest priority)', () => {
    assert.equal(flagSortValue('r'), 0);
  });

  it('returns 1 for "y"', () => {
    assert.equal(flagSortValue('y'), 1);
  });

  it('returns 2 for "b"', () => {
    assert.equal(flagSortValue('b'), 2);
  });

  it('returns 3 for "g"', () => {
    assert.equal(flagSortValue('g'), 3);
  });

  it('returns 4 for null (lowest priority)', () => {
    assert.equal(flagSortValue(null), 4);
  });

  it('returns 4 for undefined', () => {
    assert.equal(flagSortValue(undefined), 4);
  });

  it('sorts red-flagged students before green', () => {
    const students = [
      { name: 'A', flag: 'g' },
      { name: 'B', flag: 'r' },
      { name: 'C', flag: 'y' },
      { name: 'D', flag: null },
    ];
    students.sort((a, b) => flagSortValue(a.flag) - flagSortValue(b.flag));
    assert.equal(students[0].name, 'B'); // red first
    assert.equal(students[1].name, 'C'); // yellow second
    assert.equal(students[2].name, 'A'); // green third
    assert.equal(students[3].name, 'D'); // null last
  });
});

// --- FLAG_SORT_ORDER ---

describe('FLAG_SORT_ORDER', () => {
  it('contains all four flag keys', () => {
    assert.ok('r' in FLAG_SORT_ORDER);
    assert.ok('y' in FLAG_SORT_ORDER);
    assert.ok('b' in FLAG_SORT_ORDER);
    assert.ok('g' in FLAG_SORT_ORDER);
  });

  it('orders r < y < b < g', () => {
    assert.ok(FLAG_SORT_ORDER['r'] < FLAG_SORT_ORDER['y']);
    assert.ok(FLAG_SORT_ORDER['y'] < FLAG_SORT_ORDER['b']);
    assert.ok(FLAG_SORT_ORDER['b'] < FLAG_SORT_ORDER['g']);
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

  it('WEEK_LABELS maps past keys via weekKeyToLabel and appends NOW', () => {
    // Accept either approach: ternary on last index, or spread pastKeys + 'NOW'
    const hasTernary = /idx\s*===\s*arr\.length\s*-\s*1\s*\?\s*'NOW'\s*:\s*weekKeyToLabel\(key\)/.test(source);
    const hasSpread = /pastKeys\.map\(weekKeyToLabel\).*'NOW'/.test(source);
    assert.ok(
      hasTernary || hasSpread,
      'WEEK_LABELS should map past weeks via weekKeyToLabel and use NOW for the current week'
    );
  });

  it('renders legend with four labels', () => {
    assert.ok(source.includes("'Clear'"), 'Missing Clear legend');
    assert.ok(source.includes("'Low'"), 'Missing Low legend');
    assert.ok(source.includes("'Medium'"), 'Missing Medium legend');
    assert.ok(source.includes("'Critical'"), 'Missing Critical legend');
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

  it('renders Alerts section (replaced "Others" placeholder)', () => {
    assert.ok(
      source.includes('Alerts') && source.includes('alertDocs'),
      'Should render Alerts section with realtime alert data'
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

// --- Heatmap cache integration (PEP-303) ---

describe('Heatmap cache integration (PEP-303)', () => {
  it('imports useHeatmapCache hook', () => {
    assert.ok(
      source.includes('useHeatmapCache'),
      'Should import and use useHeatmapCache hook for cached heatmap reads'
    );
  });

  it('reads heatmapDocs from cache hook', () => {
    assert.ok(
      source.includes('heatmapDocs'),
      'Should destructure heatmapDocs from useHeatmapCache'
    );
  });

  it('has fast path that builds roster from cache docs', () => {
    assert.ok(
      source.includes('heatmapDocs.length > 0'),
      'Should check heatmapDocs.length to take the fast cache path'
    );
  });

  it('falls back to legacy fetch when cache is empty', () => {
    // The legacy collectionGroup query should still exist as fallback
    assert.ok(
      source.includes('collectionGroup'),
      'Should retain collectionGroup query as legacy fallback'
    );
  });

  it('builds studentInfo from cache roster rows', () => {
    assert.ok(
      source.includes('builtStudentInfo') || source.includes('row.displayName'),
      'Should build student info from cache roster data'
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

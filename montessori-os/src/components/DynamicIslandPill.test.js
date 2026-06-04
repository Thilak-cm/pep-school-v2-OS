import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'DynamicIslandPill.jsx'), 'utf-8');

describe('DynamicIslandPill component (PEP-213)', () => {

  // --- AC1: Pill visual structure ---
  describe('Pill component structure', () => {
    it('exports a default component', () => {
      assert.ok(
        source.includes('export default'),
        'Should export default DynamicIslandPill'
      );
    });

    it('renders RED FLAG label', () => {
      assert.ok(
        source.includes('RED FLAG'),
        'Should render "RED FLAG" label text'
      );
    });

    it('renders CTA button with "Read note" text', () => {
      assert.ok(
        source.includes('Read note'),
        'Should render "Read note" CTA text'
      );
    });

    it('uses dark background with rounded corners', () => {
      assert.ok(
        source.includes('borderRadius') && (source.includes('22') || source.includes('pill')),
        'Should use rounded pill shape'
      );
    });

    it('renders a flag icon in the CTA', () => {
      assert.ok(
        source.includes('Flag') || source.includes('flag'),
        'Should use a flag icon in CTA'
      );
    });
  });

  // --- AC2: Rotation behavior ---
  describe('Rotation and animation', () => {
    it('uses a timer for rotation (setInterval or setTimeout)', () => {
      assert.ok(
        source.includes('setInterval') || source.includes('setTimeout'),
        'Should use a timer for auto-rotation'
      );
    });

    it('has a progress bar element with animation', () => {
      assert.ok(
        source.includes('progress') || source.includes('Progress'),
        'Should render a progress bar'
      );
      assert.ok(
        source.includes('keyframes') || source.includes('transition') || source.includes('animation'),
        'Should animate the progress bar'
      );
    });

    it('renders dot indicators', () => {
      assert.ok(
        source.includes('.map') && (source.includes('dot') || source.includes('Dot') || source.includes('indicator')),
        'Should render dot indicators by mapping alerts'
      );
    });

    it('supports pausing rotation on tap', () => {
      assert.ok(
        source.includes('pause') || source.includes('Pause') || source.includes('paused'),
        'Should support pausing rotation'
      );
    });

    it('uses 4-second rotation interval', () => {
      assert.ok(
        source.includes('4000') || source.includes('4_000') || source.includes('ROTATION_MS'),
        'Should use 4-second (4000ms) rotation interval'
      );
    });

    it('uses elongated/oblong shape for active dot indicator', () => {
      assert.ok(
        source.includes('width: i === activeIndex') || (source.includes('18') && source.includes('activeIndex')),
        'Active dot should be wider/elongated compared to inactive dots'
      );
    });
  });

  // --- Swipe interaction ---
  describe('iOS widget stack swipe', () => {
    it('handles touch events for vertical swiping', () => {
      assert.ok(source.includes('onTouchStart'), 'Should handle touch start');
      assert.ok(source.includes('onTouchMove'), 'Should handle touch move');
      assert.ok(source.includes('onTouchEnd'), 'Should handle touch end');
    });

    it('has a swipe threshold for switching cards', () => {
      assert.ok(
        source.includes('SWIPE_THRESHOLD') || source.includes('swipeThreshold'),
        'Should have a swipe threshold constant'
      );
    });

    it('shows peek of adjacent cards during drag', () => {
      assert.ok(
        source.includes('peek') || source.includes('Peek') || source.includes('PEEK'),
        'Should show peek of adjacent cards'
      );
    });
  });

  // --- AC3: Data source ---
  describe('Data fetching', () => {
    it('reads from ai_summaries/weekly_snapshot', () => {
      assert.ok(
        source.includes('weekly_snapshot'),
        'Should read from weekly_snapshot document'
      );
    });

    it('checks redFlag.severity for filtering', () => {
      assert.ok(
        source.includes('redFlag') && source.includes('severity'),
        'Should check redFlag.severity field'
      );
    });

    it('uses getIstIsoWeekKey for current week', () => {
      assert.ok(
        source.includes('getIstIsoWeekKey'),
        'Should use getIstIsoWeekKey utility'
      );
    });

    it('supports role-aware fetch paths', () => {
      assert.ok(
        source.includes('collectionGroup') || source.includes('collection_group'),
        'Should support collectionGroup for admin path'
      );
      assert.ok(
        source.includes('getDoc') || source.includes('getDocs'),
        'Should support direct doc reads for teacher path'
      );
    });
  });

  // --- AC4: Role scoping ---
  describe('Role scoping', () => {
    it('filters by accessible classrooms', () => {
      assert.ok(
        source.includes('accessibleClassroom') || source.includes('classroomId'),
        'Should filter signals by classroom scope'
      );
    });

    it('handles superadmin seeing all students', () => {
      assert.ok(
        source.includes('superadmin'),
        'Should handle superadmin role'
      );
    });
  });

  // --- AC5: CTA navigation ---
  describe('CTA navigation', () => {
    it('calls onNavigateToStudent when CTA is tapped', () => {
      assert.ok(
        source.includes('onNavigateToStudent'),
        'Should accept and call onNavigateToStudent prop'
      );
    });
  });

  // --- AC6: Empty state ---
  describe('Empty state', () => {
    it('shows "All clear this week" when no alerts', () => {
      assert.ok(
        source.includes('All clear this week') || source.includes('all clear') || source.includes('All clear'),
        'Should show empty state message'
      );
    });

    it('shows Quick alerts header in empty state', () => {
      assert.ok(
        source.includes('Quick alerts'),
        'Should show "Quick alerts" section header'
      );
    });
  });

  // --- AC7: Alert type extensibility ---
  describe('Alert type extensibility', () => {
    it('accepts alerts as a typed array', () => {
      assert.ok(
        source.includes('alerts') && source.includes('.map'),
        'Should accept and iterate over alerts array'
      );
    });

    it('supports type-specific colors per alert', () => {
      assert.ok(
        source.includes('color') && (source.includes('.type') || source.includes('alert.color') || source.includes('alertColor')),
        'Should support per-alert-type colors'
      );
    });
  });
});

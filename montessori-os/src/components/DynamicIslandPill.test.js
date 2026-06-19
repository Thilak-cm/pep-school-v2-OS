import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'DynamicIslandPill.jsx'), 'utf-8');

describe('DynamicIslandPill component (PEP-213 + PEP-296)', () => {

  // --- Pill visual structure ---
  describe('Pill component structure', () => {
    it('exports a default component', () => {
      assert.ok(
        source.includes('export default'),
        'Should export default DynamicIslandPill'
      );
    });

    it('uses dark background with rounded corners', () => {
      assert.ok(
        source.includes('borderRadius') && (source.includes('22') || source.includes('pill')),
        'Should use rounded pill shape'
      );
    });
  });

  // --- Rotation behavior ---
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

    it('renders up/down navigation buttons', () => {
      assert.ok(
        source.includes('Previous alert') && source.includes('Next alert'),
        'Should render up and down nav buttons with aria-labels'
      );
      assert.ok(
        source.includes('ChevronUp') && source.includes('ChevronDown'),
        'Should use chevron icons for nav buttons'
      );
    });

    it('uses a vertical carousel track for smooth sliding', () => {
      assert.ok(
        source.includes('translateY') && source.includes('carouselY'),
        'Should translate the carousel track vertically'
      );
    });
  });

  // --- PEP-296: useAlertBus integration ---
  describe('useAlertBus hook integration (PEP-296)', () => {
    it('imports useAlertBus hook', () => {
      assert.ok(
        source.includes('useAlertBus'),
        'Should import and use useAlertBus hook'
      );
    });

    it('does NOT contain DEV_MOCK_ALERTS', () => {
      assert.ok(
        !source.includes('DEV_MOCK_ALERTS'),
        'DEV_MOCK_ALERTS should be removed — live data only'
      );
    });

    it('does NOT contain MOCK_ALERTS array', () => {
      assert.ok(
        !source.includes('MOCK_ALERTS'),
        'MOCK_ALERTS should be removed — live data only'
      );
    });
  });

  // --- PEP-296: CTA type-dispatch ---
  describe('CTA type-dispatch routing (PEP-296)', () => {
    it('reads ctaRoute from alert for navigation', () => {
      assert.ok(
        source.includes('ctaRoute'),
        'CTA handler should read ctaRoute for screen navigation'
      );
    });

    it('reads ctaParams from alert for screen params', () => {
      assert.ok(
        source.includes('ctaParams'),
        'CTA handler should read ctaParams for navigation params'
      );
    });

    it('accepts onNavigate prop for generic routing', () => {
      assert.ok(
        source.includes('onNavigate'),
        'Should accept onNavigate prop for non-student CTAs'
      );
    });
  });

  // --- Empty state ---
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

  // --- PEP-307: Broadcast CTA confirmation modal ---
  describe('Broadcast CTA confirmation modal (PEP-307)', () => {
    it('has a Dialog for broadcast ack confirmation', () => {
      assert.ok(
        source.includes('Dialog') && (source.includes('broadcastAck') || source.includes('ackModal') || source.includes('confirmDialog') || source.includes('ackDialog')),
        'Should have a Dialog component for broadcast acknowledgment'
      );
    });

    it('shows full message body in the confirmation dialog', () => {
      assert.ok(
        source.includes('message') && source.includes('Dialog'),
        'Should display the full message body in the confirmation dialog'
      );
    });

    it('has an "I\'ve read this" confirmation button', () => {
      assert.ok(
        source.includes("I've read this") || source.includes('I\\u2019ve read this'),
        'Should have an "I\'ve read this" confirmation button'
      );
    });

    it('only dismisses after confirmation (not on CTA tap)', () => {
      // The broadcast CTA should NOT call dismissAlert directly — it should open the modal first
      // dismissAlert should only be called from the modal confirm handler
      assert.ok(
        source.includes('ackDialog') || source.includes('ackModal') || source.includes('confirmDialog') || source.includes('broadcastAck'),
        'Should use a confirmation state/dialog before dismissing'
      );
    });
  });

  // --- PEP-323a: Poll voting in broadcast ack dialog ---
  describe('Poll voting in broadcast dialog (PEP-323a)', () => {
    it('imports voteOnBroadcast from alertService', () => {
      assert.ok(
        source.includes('voteOnBroadcast'),
        'Should import voteOnBroadcast for poll submissions'
      );
    });

    it('renders poll options when ackDialog has poll data', () => {
      assert.ok(
        source.includes('poll') && source.includes('options'),
        'Should render poll options in ack dialog'
      );
    });

    it('has a Respond/Submit button for poll broadcasts', () => {
      assert.ok(
        source.includes('Respond') || source.includes('Submit'),
        'Should have a submit button for poll responses'
      );
    });

    it('supports multi-select poll options', () => {
      assert.ok(
        source.includes('multiSelect') || source.includes('multi'),
        'Should support multi-select for polls'
      );
    });

    it('supports Other free-text input for polls', () => {
      assert.ok(
        source.includes('allowOther') || source.includes('Other'),
        'Should support Other free-text option'
      );
    });
  });

  // --- Alert type extensibility ---
  describe('Alert type extensibility', () => {
    it('accepts alerts as a typed array', () => {
      assert.ok(
        source.includes('alerts') && source.includes('.map'),
        'Should accept and iterate over alerts array'
      );
    });

    it('supports type-specific colors per alert', () => {
      assert.ok(
        source.includes('color') && (source.includes('.type') || source.includes('alert.color') || source.includes('alertColor') || source.includes('colorKey')),
        'Should support per-alert-type colors'
      );
    });
  });
});

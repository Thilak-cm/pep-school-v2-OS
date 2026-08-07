import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'useAlertBus.js'), 'utf-8');

describe('useAlertBus hook — dual-source alert subscriber (PEP-296)', () => {

  // --- Dual-source architecture ---
  describe('Dual-source subscriber', () => {
    it('imports onSnapshot from firebase/firestore', () => {
      assert.ok(
        source.includes('onSnapshot'),
        'Should import onSnapshot for realtime alerts listener'
      );
    });

    it('queries alerts collection with dip filter', () => {
      assert.ok(
        source.includes("'alerts'") || source.includes('"alerts"'),
        'Should reference the alerts Firestore collection'
      );
      assert.ok(
        source.includes("'dip'") || source.includes('"dip"'),
        'Should filter by dip field'
      );
    });

    it('reads from weekly_snapshot for red flag source', () => {
      assert.ok(
        source.includes('weekly_snapshot'),
        'Should read from weekly_snapshot for red flags'
      );
    });

    it('merges both sources into a single alerts array', () => {
      assert.ok(
        (source.includes('concat') || source.includes('...') || source.includes('spread')),
        'Should merge red flag and alert bus sources'
      );
    });
  });

  // --- Sorting and filtering ---
  describe('Sorting and filtering', () => {
    it('sorts by priority then createdAt', () => {
      assert.ok(
        source.includes('priority'),
        'Should sort by priority field'
      );
      assert.ok(
        source.includes('createdAt'),
        'Should sort by createdAt field'
      );
    });

    it('filters by dismissedBy for current user', () => {
      assert.ok(
        source.includes('dismissedBy'),
        'Should filter out alerts dismissed by current user'
      );
    });
  });

  // --- Cleanup ---
  describe('Lifecycle', () => {
    it('cleans up onSnapshot listener on unmount', () => {
      assert.ok(
        source.includes('unsubscribe') || source.includes('unsub'),
        'Should store and call unsubscribe function on cleanup'
      );
    });

    it('exports a custom hook function', () => {
      assert.ok(
        source.includes('export') && source.includes('useAlertBus'),
        'Should export useAlertBus hook'
      );
    });
  });

  // --- Readiness state machine ---
  describe('Readiness state machine', () => {
    it('keeps loading true until both alert sources are ready', () => {
      assert.ok(
        source.includes('redFlagsReady') && source.includes('realtimeReady'),
        'Should track weekly red flags and realtime alerts independently'
      );
      assert.ok(
        source.includes('const loading = !redFlagsReady || !realtimeReady'),
        'Should only leave loading after both sources settle'
      );
    });

    it('commits filtered snapshot results before marking realtime ready', () => {
      const commitStart = source.indexOf('const commitBusAlerts');
      const commitEnd = source.indexOf('const commitTargetingContext', commitStart);
      const commitSource = source.slice(commitStart, commitEnd);

      assert.ok(commitStart >= 0, 'Should centralize filtered snapshot commits');
      assert.ok(
        commitSource.indexOf('setBusAlerts(alerts)') <
          commitSource.lastIndexOf('setRealtimeReady(true)'),
        'Should commit filtered alerts before settling realtime readiness'
      );
      assert.ok(
        source.includes('targetingContextReadyRef.current') &&
          source.includes('snapshotReceivedRef.current'),
        'Should wait for both the raw snapshot and its targeting context'
      );
    });

    it('waits for explicit classroom scope readiness', () => {
      assert.ok(
        source.includes('{ classroomsLoaded = false }') &&
          source.includes('if (!classroomsLoaded)'),
        'Should not treat the initial empty classrooms prop as completed scope'
      );
    });

    it('settles failed and unauthenticated sources safely', () => {
      assert.ok(
        source.includes('A failed source has settled as empty') &&
          source.includes('setRealtimeReady(true)'),
        'A realtime listener error should settle as empty'
      );
      assert.ok(
        source.includes('if (!uid)') && source.includes('setRedFlagsReady(true)'),
        'No authenticated user should not leave the hook loading forever'
      );
    });
  });

  // --- Heatmap cache integration (PEP-303) ---
  describe('Heatmap cache fast path (PEP-303)', () => {
    it('reads from statsCache heatmap docs for red flags', () => {
      assert.ok(
        source.includes('fetchHeatmapDocs') || source.includes('heatmap_'),
        'Should use shared fetchHeatmapDocs utility for red flag source'
      );
    });

    it('falls back to legacy collectionGroup when cache is empty', () => {
      assert.ok(
        source.includes('collectionGroup'),
        'Should retain collectionGroup query as legacy fallback'
      );
    });

    it('builds signals from cache roster rows', () => {
      assert.ok(
        source.includes('roster') && source.includes('heatmapDocs'),
        'Should extract roster from heatmap cache docs'
      );
    });
  });

  // --- Transform integration ---
  describe('Transform integration', () => {
    it('imports transformForDisplay from alertTransforms', () => {
      assert.ok(
        source.includes('transformForDisplay'),
        'Should import and use transformForDisplay'
      );
    });

    it('imports transformRedFlag from alertTransforms', () => {
      assert.ok(
        source.includes('transformRedFlag'),
        'Should import and use transformRedFlag for weekly_snapshot data'
      );
    });
  });
});

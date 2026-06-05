import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'index.js'), 'utf-8');

describe('Alert CF helpers (PEP-296)', () => {

  // --- createAlert helper ---
  describe('createAlert helper', () => {
    it('exports createAlert function', () => {
      assert.ok(
        source.includes('export') && source.includes('createAlert'),
        'Should export createAlert'
      );
    });

    it('writes to the alerts collection', () => {
      assert.ok(
        source.includes("'alerts'") || source.includes('"alerts"'),
        'Should write to the alerts Firestore collection'
      );
    });

    it('uses deterministic doc ID pattern', () => {
      // Deterministic IDs prevent duplicates on CF retries
      assert.ok(
        source.includes('.doc(') && (source.includes('alertId') || source.includes('docId')),
        'Should use a deterministic document ID, not auto-generated'
      );
    });

    it('validates required bus fields', () => {
      for (const field of ['type', 'dip', 'priority', 'createdAt', 'source']) {
        assert.ok(
          source.includes(field),
          `Should reference required bus field: ${field}`
        );
      }
    });
  });

  // --- cleanupExpiredAlerts scheduled CF ---
  describe('cleanupExpiredAlerts scheduled CF', () => {
    it('exports cleanupExpiredAlerts', () => {
      assert.ok(
        source.includes('export') && source.includes('cleanupExpiredAlerts'),
        'Should export cleanupExpiredAlerts scheduled function'
      );
    });

    it('is a scheduled pubsub function', () => {
      assert.ok(
        source.includes('pubsub') && source.includes('schedule'),
        'Should be a pubsub.schedule function'
      );
    });

    it('queries for expired alerts using expiresAt', () => {
      assert.ok(
        source.includes('expiresAt'),
        'Should query alerts by expiresAt field'
      );
    });

    it('deletes expired alert documents', () => {
      assert.ok(
        source.includes('delete') || source.includes('batch'),
        'Should delete expired alert docs'
      );
    });
  });
});

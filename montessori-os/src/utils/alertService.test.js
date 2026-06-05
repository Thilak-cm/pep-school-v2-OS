import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'alertService.js'), 'utf-8');

describe('alertService — dismiss utility (PEP-296)', () => {

  it('exports dismissAlert function', () => {
    assert.ok(
      source.includes('export') && source.includes('dismissAlert'),
      'Should export dismissAlert'
    );
  });

  it('uses updateDoc from firebase/firestore', () => {
    assert.ok(
      source.includes('updateDoc'),
      'Should use updateDoc to update alert document'
    );
  });

  it('writes to the dismissedBy field', () => {
    assert.ok(
      source.includes('dismissedBy'),
      'Should update the dismissedBy map field'
    );
  });

  it('references the alerts collection', () => {
    assert.ok(
      source.includes("'alerts'") || source.includes('"alerts"'),
      'Should reference the alerts Firestore collection'
    );
  });

  it('uses serverTimestamp for dismiss time', () => {
    assert.ok(
      source.includes('serverTimestamp') || source.includes('Timestamp'),
      'Should use server timestamp for dismiss time'
    );
  });
});
